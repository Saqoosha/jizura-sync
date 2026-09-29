// jizura-sync for macOS: the web app in a WKWebView, fed by the Spotify and Music apps running on
// this Mac instead of the Spotify Web API.
//
// Playback comes from each app's scripting dictionary (player state, player position, current
// track), read over Apple Events -- no account, no Client ID. The page is served from
// the bundle through a custom scheme, because WebKit refuses ES modules from file:// URLs.
//
// Build: tools/build-mac.sh. Set JIZURA_WEB_ROOT=<repo>/web to serve the page from a checkout
// while editing it (reload with Cmd+R), instead of rebuilding the bundle, and JIZURA_QUERY=mock
// (or any query the page takes) to try it without a player.

import AppKit
import ScriptingBridge
import WebKit

// MARK: - Players

struct ScriptError: Error {
    let number: Int
    let message: String
    /** errAEEventNotPermitted / errAEEventWouldRequireUserConsent: the Automation permission is off. */
    var isPermission: Bool { number == -1743 || number == -1744 }
}

func fourCC(_ s: String) -> FourCharCode { s.utf8.reduce(0) { $0 << 8 | FourCharCode($1) } }

/**
 * A player app, scripted over Apple Events addressed to its process ID. An event for a process
 * ID fails once that process is gone, where AppleScript's `tell application` -- addressed by
 * name or bundle ID -- would launch the app again. Used only on the bridge's serial queue.
 */
final class Source: NSObject, SBApplicationDelegate {
    let name: String
    let bundleID: String
    private let commandClass: String      // event class of play / pause / next / previous
    private let trackIDKey: String
    private let durationToSeconds: Double
    private let artworkURLKey: String?    // Spotify has a URL; Music hands over the image itself
    private var app: SBApplication?
    private var pid: pid_t = 0
    private var failure: Error?

    init(name: String, bundleID: String, commandClass: String, trackIDKey: String, durationToSeconds: Double, artworkURLKey: String?) {
        self.name = name
        self.bundleID = bundleID
        self.commandClass = commandClass
        self.trackIDKey = trackIDKey
        self.durationToSeconds = durationToSeconds
        self.artworkURLKey = artworkURLKey
    }

    var isRunning: Bool { process != nil }
    private var process: NSRunningApplication? {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first { !$0.isTerminated }
    }

    private func target() throws -> SBApplication {
        guard let process else { throw ScriptError(number: -600, message: "\(name) is not running") }
        if app == nil || pid != process.processIdentifier {
            pid = process.processIdentifier
            app = SBApplication(processIdentifier: pid)
            app?.delegate = self
            app?.timeout = 120          // ticks: 2 s
        }
        return app!
    }

    // ScriptingBridge reports a failed event here and returns nil from the getter.
    func eventDidFail(_ event: UnsafePointer<AppleEvent>, withError error: any Error) -> Any? {
        failure = error
        return nil
    }

    private func get(_ object: SBObject, _ key: String) throws -> Any? {
        failure = nil
        let value = object.value(forKey: key)
        if let failure {
            let e = failure as NSError
            throw ScriptError(number: e.code, message: e.localizedDescription)
        }
        return value
    }

    /** State, position and track ID. `at` is when the position was read (system uptime). */
    func readState() throws -> (state: String, positionS: Double, trackID: String, at: Double) {
        let app = try target()
        let code = (try get(app, "playerState") as? NSNumber)?.uint32Value ?? 0
        switch code {
        case fourCC("kPSS"): return ("stopped", 0, "", 0)
        case fourCC("kPSp"): break
        default: break           // playing, fast forwarding, rewinding
        }
        let t0 = ProcessInfo.processInfo.systemUptime
        let position = (try get(app, "playerPosition") as? NSNumber)?.doubleValue ?? 0
        let t1 = ProcessInfo.processInfo.systemUptime
        guard let track = app.value(forKey: "currentTrack") as? SBObject else { return ("stopped", 0, "", 0) }
        var id = (try? get(track, trackIDKey)) as? String ?? ""
        if id.isEmpty { id = (try get(track, "name") as? String) ?? "" }       // Music: a stream may have no ID
        return (code == fourCC("kPSp") ? "paused" : "playing", position, id, (t0 + t1) / 2)
    }

    /** Title, artist, album, duration and cover of the current track, in the page's shape. */
    func readTrack(key: String) throws -> [String: Any] {
        let app = try target()
        guard let track = app.value(forKey: "currentTrack") as? SBObject else { throw ScriptError(number: 0, message: "no current track") }
        var artUrl: String? = nil
        if let artworkURLKey {
            artUrl = (try? get(track, artworkURLKey)) as? String
        } else if let artworks = (try? get(track, "artworks")) as? SBElementArray, let artwork = artworks.firstObject as? SBObject {
            let raw = try? get(artwork, "rawData")
            if let data = (raw as? Data) ?? (raw as? NSAppleEventDescriptor)?.data, let thumb = thumbnail(data) {
                artUrl = "data:image/jpeg;base64,\(thumb.base64EncodedString())"
            }
        }
        let duration = ((try? get(track, "duration")) as? NSNumber)?.doubleValue ?? 0
        return ["trackId": key,
                "title": try get(track, "name") as? String ?? "",
                "artist": (try? get(track, "artist")) as? String ?? "",
                "album": (try? get(track, "album")) as? String ?? "",
                "durationMs": duration * durationToSeconds * 1000,
                "artUrl": artUrl.map { $0.isEmpty ? NSNull() : $0 as Any } ?? NSNull()]
    }

    /** play, pause, next, previous, or seek to `seconds`. Does nothing if the app is not running. */
    func command(_ cmd: String, seconds: Double) throws {
        guard isRunning else { return }
        if cmd == "seek" {
            let app = try target()
            failure = nil
            app.setValue(seconds, forKey: "playerPosition")
            if let failure { throw failure }
            return
        }
        guard let id = ["play": "Play", "pause": "Paus", "next": "Next", "previous": "Prev"][cmd] else { return }
        _ = try target()
        let event = NSAppleEventDescriptor(eventClass: fourCC(commandClass), eventID: fourCC(id),
                                           targetDescriptor: NSAppleEventDescriptor(processIdentifier: pid),
                                           returnID: AEReturnID(kAutoGenerateReturnID), transactionID: AETransactionID(kAnyTransactionID))
        _ = try event.sendEvent(options: [.waitForReply], timeout: 2)
    }

    /** Music hands over the full-size cover; the bar shows it at 64 pt. */
    private func thumbnail(_ data: Data) -> Data? {
        guard let image = NSImage(data: data), let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 128, pixelsHigh: 128,
              bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
              bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(x: 0, y: 0, width: 128, height: 128))
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])
    }
}

// Codes and keys from each app's sdef. Spotify's sdef calls `duration` seconds; it is milliseconds.
let spotify = Source(name: "Spotify", bundleID: "com.spotify.client", commandClass: "spfy",
                     trackIDKey: "id", durationToSeconds: 0.001, artworkURLKey: "artworkUrl")
let music = Source(name: "Music", bundleID: "com.apple.Music", commandClass: "hook",
                   trackIDKey: "persistentID", durationToSeconds: 1, artworkURLKey: nil)

/**
 * Reads the player apps on a serial queue and pushes one state object per reading to the page
 * (`window.jizuraNative.update`), which extrapolates the position in between.
 *
 * Both apps post a distributed notification on a track change, play and pause (measured), so a
 * reading follows each one at once. Neither posts one on a seek, so while something plays the
 * bridge also reads once a second to catch a seek made in the player app. Paused or idle, with no
 * error to retry, it waits for a notification or for a player to launch.
 */
@MainActor
final class PlayerBridge: NSObject, WKScriptMessageHandler {
    private static let playingInterval = 1.0
    /** Retry after a failed read (player still launching, Automation not yet allowed). */
    private static let retryInterval = 2.0
    private static let notifications = ["com.spotify.client.PlaybackStateChanged", "com.apple.Music.playerInfo"]
    private let queue = DispatchQueue(label: "sh.saqoo.jizura-sync.player")
    private weak var webView: WKWebView?
    private var timer: Timer?
    private var observers: [NSObjectProtocol] = []
    private var busy = false
    private var again = false        // something asked for a reading while one was running
    private var playing = false
    private var awake: NSObjectProtocol?   // keeps the display on while a song plays in view

    /**
     * Whether any of the window is on screen. Hidden (minimised, another app full screen, a
     * covering window), it skips the once-a-second reading and lets the display sleep; the
     * players' notifications still keep the track current.
     */
    var visible = true {
        didSet {
            guard visible != oldValue else { return }
            if visible { pollNow() } else { timer?.invalidate(); timer = nil }
            updateAwake()
        }
    }

    // Confined to `queue`.
    nonisolated(unsafe) private var followed: Source?
    nonisolated(unsafe) private var trackKey: String?
    nonisolated(unsafe) private var track: [String: Any]?
    nonisolated(unsafe) private var commandSeq = 0

    init(webView: WKWebView) {
        self.webView = webView
    }

    /** Called by each page load, so a reload gets the current state too. */
    func start() {
        if observers.isEmpty {
            // AppKit holds distributed notifications back while the app is inactive, which is
            // most of the time here; only the selector API can ask for them regardless.
            for name in Self.notifications {
                DistributedNotificationCenter.default().addObserver(self, selector: #selector(playerChanged(_:)), name: Notification.Name(name),
                                                                    object: nil, suspensionBehavior: .deliverImmediately)
            }
            let workspace = NSWorkspace.shared.notificationCenter
            for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
                observers.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                    let id = (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.bundleIdentifier
                    guard id == spotify.bundleID || id == music.bundleID else { return }
                    MainActor.assumeIsolated { self?.pollNow() }
                })
            }
        }
        queue.async { self.commandSeq = 0 }    // the new page counts its commands from 0
        pollNow()
    }

    @objc private func playerChanged(_ note: Notification) { pollNow() }

    private func pollNow() {
        timer?.invalidate()
        timer = nil
        guard !busy else { again = true; return }
        busy = true
        queue.async { [weak self] in
            guard let self else { return }
            let message = self.poll()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    self.busy = false
                    self.send(message)
                    if self.again { self.again = false; self.pollNow() } else { self.scheduleNext(after: message) }
                }
            }
        }
    }

    private func scheduleNext(after message: [String: Any]) {
        let delay: TimeInterval
        if let error = message["error"] as? [String: Any] {
            guard error["kind"] as? String != "idle" else { return }
            delay = Self.retryInterval
        } else {
            guard message["playing"] as? Bool == true, visible else { return }
            delay = Self.playingInterval
        }
        timer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.pollNow() }
        }
    }

    private func updateAwake() {
        if playing && visible {
            awake = awake ?? ProcessInfo.processInfo.beginActivity(options: .idleDisplaySleepDisabled, reason: "Showing lyrics of the playing song")
        } else if let awake {
            ProcessInfo.processInfo.endActivity(awake)
            self.awake = nil
        }
    }

    private func send(_ message: [String: Any]) {
        playing = message["playing"] as? Bool == true
        updateAwake()
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.jizuraNative && window.jizuraNative.update(\(json))")
    }

    // Page → native: { cmd: 'start' } or { cmd: 'play' | 'pause' | 'next' | 'previous' | 'seek', ms?, seq }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        if cmd == "start" { start(); return }
        let seq = body["seq"] as? Int ?? 0
        guard ["play", "pause", "next", "previous", "seek"].contains(cmd) else { return }
        let ms = body["ms"] as? Double ?? 0
        queue.async { [weak self] in
            guard let self else { return }
            do { try self.followed?.command(cmd, seconds: ms.isFinite ? max(0, ms) / 1000 : 0) } catch { NSLog("jizura-sync: \(cmd) failed: \(error)") }
            self.commandSeq = max(self.commandSeq, seq)
        }
        pollNow()
    }

    /** One reading of every running player. Runs on `queue`. */
    nonisolated private func poll() -> [String: Any] {
        let seq = commandSeq       // the page drops readings started before its latest command
        struct Reading { let source: Source; let state: String; let positionS: Double; let trackId: String; let at: Double }
        var readings: [Reading] = []
        var failures: [String] = []
        var denied: Source?
        let running = [spotify, music].filter(\.isRunning)
        for source in running {
            do {
                let r = try source.readState()
                readings.append(Reading(source: source, state: r.state, positionS: r.positionS, trackId: r.trackID, at: r.at))
            } catch let e as ScriptError where e.isPermission {
                denied = source            // reported only if the other player gives nothing to follow
            } catch {
                // Quit mid-poll or busy: the next poll retries. Reported only if no player reads.
                failures.append("Could not read \(source.name): \((error as? ScriptError)?.message ?? "\(error)")")
            }
        }
        // Follow the app that is playing; while nothing plays, stay on the one followed last.
        let withTrack = readings.filter { $0.state != "stopped" && !$0.trackId.isEmpty }
        let playing = withTrack.filter { $0.state == "playing" }
        guard let pick = playing.first(where: { $0.source === followed }) ?? playing.first
                ?? withTrack.first(where: { $0.source === followed }) ?? withTrack.first else {
            followed = nil
            if let denied {
                return ["seq": seq, "error": ["kind": "permission",
                    "message": "Allow jizura-sync to control \(denied.name) in System Settings → Privacy & Security → Automation"]]
            }
            if let failure = failures.first { return ["seq": seq, "error": ["kind": "script", "message": failure]] }
            return ["seq": seq, "error": ["kind": "idle",
                "message": running.isEmpty ? "Open Spotify or Music and play a song" : "Nothing is playing in \(running.map(\.name).joined(separator: " or "))"]]
        }
        followed = pick.source
        let key = "\(pick.source.bundleID):\(pick.trackId)"
        if key != trackKey {
            guard let meta = try? pick.source.readTrack(key: key) else {
                return ["seq": seq, "error": ["kind": "transient", "message": "Could not read the current track from \(pick.source.name)"]]
            }
            track = meta
            trackKey = key
        }
        let isPlaying = pick.state == "playing"
        let elapsed = isPlaying ? ProcessInfo.processInfo.systemUptime - pick.at : 0
        return ["seq": seq, "source": pick.source.name, "playing": isPlaying,
                "positionMs": (pick.positionS + elapsed) * 1000, "track": track ?? [:]]
    }
}

// MARK: - Page

/** Serves `jizura://app/<path>` from `root`: the bundled web/, or JIZURA_WEB_ROOT. */
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "jizura"
    private let root: URL

    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish()
            return
        }
        let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json",
                     "svg": "image/svg+xml", "png": "image/png", "woff2": "font/woff2", "ttf": "font/ttf", "otf": "font/otf"]
        let type = types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                        headerFields: ["Content-Type": "\(type); charset=utf-8", "Cache-Control": "no-store"])!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

// MARK: - App

/**
 * The page fills the window under a transparent title bar, so the web view takes every click
 * there. This strip over the title bar gives dragging (and double-click zoom) back to the window.
 */
final class TitleBarDragView: NSView {
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick")
            if action == "Minimize" { window?.performMiniaturize(nil) } else if action != "None" { window?.performZoom(nil) }
            return
        }
        window?.performDrag(with: event)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate {
    /** JIZURA's aspects (`J.designSize`, app.js `ASPECTS`): a window of one of these shapes has no letterbox. */
    private static let aspects: [CGFloat] = [16.0 / 9, 9.0 / 16, 4.0 / 3, 3.0 / 4, 1, 4.0 / 5, 21.0 / 9]

    private var window: NSWindow!
    private var webView: WKWebView!
    private var bridge: PlayerBridge!
    private var dragBar: TitleBarDragView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let root = ProcessInfo.processInfo.environment["JIZURA_WEB_ROOT"].map { URL(fileURLWithPath: $0) }
            ?? Bundle.main.resourceURL!.appendingPathComponent("web")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(root: root), forURLScheme: BundleSchemeHandler.scheme)
        config.preferences.isElementFullscreenEnabled = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = .black
        webView.setValue(false, forKey: "drawsBackground")
        bridge = PlayerBridge(webView: webView)
        config.userContentController.add(bridge, name: "jizuraNative")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "jizura-sync"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = .black
        window.collectionBehavior.insert(.fullScreenPrimary)
        let content = NSView()
        webView.frame = content.bounds
        webView.autoresizingMask = [.width, .height]
        content.addSubview(webView)
        dragBar = TitleBarDragView()
        dragBar.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(dragBar)
        NSLayoutConstraint.activate([
            dragBar.topAnchor.constraint(equalTo: content.topAnchor),
            dragBar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            dragBar.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            dragBar.heightAnchor.constraint(equalToConstant: 28),
        ])
        window.contentView = content
        window.delegate = self
        window.setFrameAutosaveName("main")
        window.contentMinSize = NSSize(width: 320, height: 320)
        if window.setFrameUsingName("main") {
            snapWindow(animate: false)      // a frame saved before snapping existed, or in full screen
        } else {
            window.center()
        }
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)

        let query = ProcessInfo.processInfo.environment["JIZURA_QUERY"]
            .flatMap { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) }.map { "?\($0)" } ?? ""
        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html\(query)")!))
        NSApp.activate()
    }

    private var resizeStart: NSRect?

    // No title bar in full screen: the strip would only take the page's clicks.
    func windowWillEnterFullScreen(_ notification: Notification) { dragBar.isHidden = true }
    func windowDidExitFullScreen(_ notification: Notification) { dragBar.isHidden = false }

    func windowDidChangeOcclusionState(_ notification: Notification) {
        bridge.visible = window.occlusionState.contains(.visible)
    }

    func windowWillStartLiveResize(_ notification: Notification) {
        resizeStart = window.frame
    }

    /** Resizing is free while dragging; on release the window settles on the nearest JIZURA aspect. */
    func windowDidEndLiveResize(_ notification: Notification) {
        defer { resizeStart = nil }
        guard !window.styleMask.contains(.fullScreen) else { return }
        snapWindow(animate: true, from: resizeStart)
    }

    /**
     * Reshapes the window to the nearest JIZURA aspect, keeping its area. On each axis the edge
     * the drag left alone stays put; an axis whose edges both stayed (a drag on the other axis's
     * edge) keeps its centre.
     */
    private func snapWindow(animate: Bool, from start: NSRect? = nil) {
        let old = window.frame
        let content = window.contentRect(forFrameRect: old).size
        guard content.width > 0, content.height > 0 else { return }
        let ratio = content.width / content.height
        let aspect = Self.aspects.min { abs(log(ratio / $0)) < abs(log(ratio / $1)) }!
        let area = content.width * content.height
        var size = NSSize(width: (area * aspect).squareRoot(), height: (area / aspect).squareRoot())
        // Near the minimum size the same area would put one side below it: grow instead of distorting.
        let grow = max(1, window.contentMinSize.width / size.width, window.contentMinSize.height / size.height)
        size = NSSize(width: (size.width * grow).rounded(), height: (size.height * grow).rounded())
        guard size != content else { return }
        var frame = window.frameRect(forContentRect: NSRect(origin: .zero, size: size))
        let start = start ?? old
        func origin(_ lo: CGFloat, _ hi: CGFloat, _ startLo: CGFloat, _ startHi: CGFloat, _ length: CGFloat) -> CGFloat {
            let loMoved = abs(lo - startLo) > 0.5, hiMoved = abs(hi - startHi) > 0.5
            if hiMoved && !loMoved { return lo }                 // dragged the right / top edge
            if loMoved && !hiMoved { return hi - length }        // dragged the left / bottom edge
            return (lo + hi) / 2 - length / 2
        }
        frame.origin = NSPoint(x: origin(old.minX, old.maxX, start.minX, start.maxX, frame.width),
                               y: origin(old.minY, old.maxY, start.minY, start.maxY, frame.height))
        window.setFrame(window.constrainFrameRect(frame, to: window.screen), display: true, animate: animate)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Links that leave the page (target=_blank, or any main-frame navigation off jizura://) open in
    // the browser; only http(s), so nothing the page links to can open a file or another app.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        openExternal(action.request.url)
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url, url.scheme != BundleSchemeHandler.scheme, action.targetFrame?.isMainFrame == true else { return .allow }
        openExternal(url)
        return .cancel
    }

    private func openExternal(_ url: URL?) {
        guard let url, ["http", "https"].contains(url.scheme?.lowercased()) else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func reloadPage(_ sender: Any?) { webView.reload() }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About jizura-sync", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide jizura-sync", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit jizura-sync", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reloadPage(_:)), keyEquivalent: "r")
        let full = viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { AppDelegate() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
