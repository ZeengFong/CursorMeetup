import Foundation
import MapKit
import CoreLocation

enum MapGeometry {
    /// Unwraps all coordinates from an `MKPolyline`.
    static func coordinates(from polyline: MKPolyline) -> [CLLocationCoordinate2D] {
        var coords = [CLLocationCoordinate2D](
            repeating: kCLLocationCoordinate2DInvalid,
            count: polyline.pointCount
        )
        polyline.getCoordinates(&coords, range: NSRange(location: 0, length: polyline.pointCount))
        return coords
    }

    /// Cumulative geodesic distance along the polyline from the first point (meters).
    static func cumulativeDistances(for coordinates: [CLLocationCoordinate2D]) -> [Double] {
        guard !coordinates.isEmpty else { return [] }
        var acc: [Double] = [0]
        var total: Double = 0
        for i in 1..<coordinates.count {
            let a = CLLocation(latitude: coordinates[i - 1].latitude, longitude: coordinates[i - 1].longitude)
            let b = CLLocation(latitude: coordinates[i].latitude, longitude: coordinates[i].longitude)
            total += a.distance(from: b)
            acc.append(total)
        }
        return acc
    }

    /// Samples roughly `count` coordinates along the route (by arc length).
    static func sampleCoordinates(_ coordinates: [CLLocationCoordinate2D], count: Int) -> [CLLocationCoordinate2D] {
        guard coordinates.count >= 2, count >= 1 else { return coordinates }
        let cum = cumulativeDistances(for: coordinates)
        guard let total = cum.last, total > 0 else { return [coordinates.first!] }
        var result: [CLLocationCoordinate2D] = []
        for k in 0..<count {
            let target = total * (Double(k) + 0.5) / Double(count)
            if let c = pointAlongPolyline(coordinates: coordinates, cumulative: cum, distanceAlong: target) {
                result.append(c)
            }
        }
        return result.isEmpty ? [coordinates[coordinates.count / 2]] : result
    }

    private static func pointAlongPolyline(
        coordinates: [CLLocationCoordinate2D],
        cumulative: [Double],
        distanceAlong: Double
    ) -> CLLocationCoordinate2D? {
        guard let total = cumulative.last else { return nil }
        let d = min(max(distanceAlong, 0), total)
        if let idx = cumulative.firstIndex(where: { $0 >= d }) {
            let i = max(idx, 1)
            let segStart = cumulative[i - 1]
            let segEnd = cumulative[i]
            let t = segEnd > segStart ? (d - segStart) / (segEnd - segStart) : 0
            let a = coordinates[i - 1]
            let b = coordinates[i]
            let lat = a.latitude + (b.latitude - a.latitude) * t
            let lon = a.longitude + (b.longitude - a.longitude) * t
            return CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        return coordinates.last
    }

    /// Projects `point` onto the polyline; returns geodesic distance from start along polyline to that projection (meters).
    static func routeProgressMeters(point: CLLocationCoordinate2D, polyline coordinates: [CLLocationCoordinate2D], cumulative: [Double]) -> Double {
        guard coordinates.count >= 2, cumulative.count == coordinates.count else { return 0 }
        var bestDist = Double.greatestFiniteMagnitude
        var bestProgress: Double = 0
        let p = CLLocation(latitude: point.latitude, longitude: point.longitude)
        for i in 1..<coordinates.count {
            let a = coordinates[i - 1]
            let b = coordinates[i]
            let (proj, t) = project(point: p, segmentFrom: a, to: b)
            let segStart = cumulative[i - 1]
            let segLen = cumulative[i] - cumulative[i - 1]
            let along = segStart + t * segLen
            let d = p.distance(from: proj)
            if d < bestDist {
                bestDist = d
                bestProgress = along
            }
        }
        return bestProgress
    }

    /// Minimum geodesic distance from `point` to any segment of the polyline (meters).
    static func distanceFromRouteMeters(point: CLLocationCoordinate2D, polyline coordinates: [CLLocationCoordinate2D]) -> Double {
        guard coordinates.count >= 2 else { return 0 }
        let p = CLLocation(latitude: point.latitude, longitude: point.longitude)
        var best = Double.greatestFiniteMagnitude
        for i in 1..<coordinates.count {
            let a = coordinates[i - 1]
            let b = coordinates[i]
            let (proj, _) = project(point: p, segmentFrom: a, to: b)
            best = min(best, p.distance(from: proj))
        }
        return best
    }

    /// Approximates extra driving time for a small deviation off the corridor (minutes).
    /// Uses a there-and-back style fudge: `2 * (distance / speedKmh) * 60`.
    static func detourMinutes(offRouteMeters: Double, assumedKmh: Double = 45) -> Double {
        let km = offRouteMeters / 1000
        guard assumedKmh > 0 else { return 0 }
        return 2 * (km / assumedKmh) * 60
    }

    private static func project(point: CLLocation, segmentFrom a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> (CLLocation, Double) {
        let ax = a.latitude
        let ay = a.longitude
        let bx = b.latitude
        let by = b.longitude
        let px = point.coordinate.latitude
        let py = point.coordinate.longitude
        let abx = bx - ax
        let aby = by - ay
        let apx = px - ax
        let apy = py - ay
        let abLenSq = abx * abx + aby * aby
        if abLenSq < 1e-12 {
            return (CLLocation(latitude: ax, longitude: ay), 0)
        }
        var t = (apx * abx + apy * aby) / abLenSq
        t = min(max(t, 0), 1)
        let lat = ax + t * abx
        let lon = ay + t * aby
        return (CLLocation(latitude: lat, longitude: lon), t)
    }
}
