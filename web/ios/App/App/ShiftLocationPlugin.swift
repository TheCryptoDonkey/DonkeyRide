import Foundation
import Capacitor
import CoreLocation
import UIKit

/**
 On-shift location for the iOS driver app.

 Android uses @capacitor-community/background-geolocation, which does not
 compile against Capacitor 8 on iOS (it still calls `bridge.savedCall` and
 the pre-8 `getBool(_:)`) and pulls in Google Play Services besides. Rather
 than patch an unmaintained plugin, iOS gets this: a direct CLLocationManager
 watcher with the same three-method surface the web app already uses, so
 `native-location.ts` only has to pick a name.

 Deliberate choices:

 - `showsBackgroundLocationIndicator` is ON. The blue status bar is the
   driver's own visible proof that a shift is tracking them, and hiding it
   would be exactly the wrong instinct for this app.
 - `pausesLocationUpdatesAutomatically` is OFF. iOS pausing updates during a
   quiet spell reads to the operator as a driver who went away.
 - Tracking stops completely on `removeWatcher` — going off shift means the
   app stops watching, not that it keeps a quieter eye on you.

 Toolchain note: Capacitor 8 declares `CAPPluginCall.reject` inside
 `#if $NonescapableTypes`, a Swift 6.1 feature. On Xcode 16.2 (Swift 6.0.3)
 that member is invisible and any call to it fails to compile, which is
 also what kills the community plugin here. Failures are therefore
 reported as a resolved `{error: {code, message}}` payload, which
 `native-location.ts` reads alongside the Android plugin's real error
 argument. Once the project moves to Xcode 16.3+, `fail()` can go back to
 `call.reject`.
 */
@objc(ShiftLocationPlugin)
public class ShiftLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {

    public let identifier = "ShiftLocationPlugin"
    public let jsName = "ShiftLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addWatcher", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeWatcher", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    /// The single live watcher. The driver app starts one per shift.
    private var watcherCall: CAPPluginCall?
    /// Reject a cached fix older than this — a stale position is a lie about
    /// where the driver is now, and dispatch is decided on it.
    private var maxFixAgeSeconds: TimeInterval = 30
    private var allowStale = false

    @objc func addWatcher(_ call: CAPPluginCall) {
        call.keepAlive = true
        allowStale = call.getBool("stale", false)
        let distanceFilter = call.getDouble("distanceFilter", 25)

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if let previous = self.watcherCall {
                // Replacing a watcher: release the old call rather than
                // leaving it saved for the life of the process.
                self.bridge?.releaseCall(previous)
            }
            self.watcherCall = call

            self.manager.delegate = self
            self.manager.desiredAccuracy = kCLLocationAccuracyBest
            self.manager.distanceFilter = distanceFilter > 0 ? distanceFilter : kCLDistanceFilterNone
            self.manager.pausesLocationUpdatesAutomatically = false
            self.manager.activityType = .automotiveNavigation

            switch self.manager.authorizationStatus {
            case .notDetermined:
                // Always, not WhenInUse: the shift has to survive the screen
                // going off. The prompt explains that in Info.plist.
                self.manager.requestAlwaysAuthorization()
            case .denied, .restricted:
                self.fail(call, "Permission denied.", code: "NOT_AUTHORIZED")
                return
            default:
                break
            }

            self.startUpdating()
        }
    }

    @objc func removeWatcher(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            self.manager.stopUpdatingLocation()
            if #available(iOS 9.0, *) {
                self.manager.allowsBackgroundLocationUpdates = false
            }
            if let watcher = self.watcherCall {
                self.bridge?.releaseCall(watcher)
                self.watcherCall = nil
            }
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                self.fail(call, "No link to settings available", code: nil)
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    self.fail(call, "Could not open settings", code: nil)
                }
            }
        }
    }

    private func startUpdating() {
        if #available(iOS 9.0, *) {
            // Only legal with the `location` background mode declared, which
            // Info.plist does.
            manager.allowsBackgroundLocationUpdates = true
        }
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
        manager.startUpdatingLocation()
    }

    /// See the toolchain note above: an error travels as a resolved
    /// payload because `reject` is not visible on Swift 6.0.
    private func fail(_ call: CAPPluginCall, _ message: String, code: String?) {
        call.resolve([
            "error": [
                "message": message,
                "code": code ?? ""
            ]
        ])
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let call = watcherCall, let location = locations.last else { return }
        if !allowStale && abs(location.timestamp.timeIntervalSinceNow) > maxFixAgeSeconds {
            return
        }
        call.resolve([
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "speed": location.speed,
            "bearing": location.course,
            "time": location.timestamp.timeIntervalSince1970 * 1000
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let call = watcherCall else { return }
        if let clError = error as? CLError {
            switch clError.code {
            case .locationUnknown:
                // iOS says this while it is still working on a first fix.
                return
            case .denied:
                manager.stopUpdatingLocation()
                fail(call, "Permission denied.", code: "NOT_AUTHORIZED")
                return
            default:
                break
            }
        }
        fail(call, error.localizedDescription, code: nil)
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = watcherCall else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            // WhenInUse still works while the app is open; the driver is
            // told what they lose by the app, not silently downgraded.
            startUpdating()
        case .denied, .restricted:
            manager.stopUpdatingLocation()
            fail(call, "Permission denied.", code: "NOT_AUTHORIZED")
        default:
            break
        }
    }
}
