import Foundation
import MapKit
import CoreLocation

enum PartybusError: LocalizedError {
    case emptyField(String)
    case geocodeFailed(String)
    case noRoute
    case invalidBudget
    case noDestinationWithinBudget

    var errorDescription: String? {
        switch self {
        case .emptyField(let s): return s
        case .geocodeFailed(let q): return "Could not find \(q). Try a more specific place name."
        case .noRoute: return "No driving route found between those places."
        case .invalidBudget: return "Enter a time budget greater than zero."
        case .noDestinationWithinBudget:
            return "No interesting place turned up within that drive time. Try a longer limit or a different starting point."
        }
    }
}

@MainActor
final class RoutePlanningService {
    private let poiSearchRadius: CLLocationDistance = 4_000
    private let samplePointCount = 10
    private let maxPoiQueries = 10
    private let defaultDwell: Double = 10

    /// Broad fetch; narrow with these sets (some SDKs reject `MKPointOfInterestFilter(including:)`).
    private let roadCategories: Set<MKPointOfInterestCategory> = [
        .park,
        .beach,
        .marina,
        .restaurant,
        .cafe,
        .bakery,
        .gasStation,
        .store,
        .museum,
        .landmark,
    ]

    private let coolCategories: Set<MKPointOfInterestCategory> = [
        .landmark,
        .museum,
        .park,
        .beach,
        .marina,
        .nationalPark,
    ]

    func geocode(_ query: String) async throws -> MKMapItem {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw PartybusError.emptyField("Enter both origin and destination.") }

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = trimmed
        let search = MKLocalSearch(request: request)
        let response = try await search.start()
        guard let first = response.mapItems.first else {
            throw PartybusError.geocodeFailed(trimmed)
        }
        return first
    }

    func fetchDrivingRoute(from: MKMapItem, to: MKMapItem) async throws -> MKRoute {
        let request = MKDirections.Request()
        request.source = from
        request.destination = to
        request.transportType = .automobile
        let directions = MKDirections(request: request)
        let response = try await directions.calculate()
        guard let route = response.routes.first else {
            throw PartybusError.noRoute
        }
        return route
    }

    func collectPOICandidates(
        along coordinates: [CLLocationCoordinate2D],
        cumulative: [Double]
    ) async throws -> [POICandidate] {
        let samples = MapGeometry.sampleCoordinates(coordinates, count: samplePointCount)
        var seen = Set<String>()
        var candidates: [POICandidate] = []

        for (idx, center) in samples.enumerated() where idx < maxPoiQueries {
            let poiRequest = MKLocalPointsOfInterestRequest(center: center, radius: poiSearchRadius)
            poiRequest.pointOfInterestFilter = .includingAll

            let searchRequest = MKLocalSearch.Request(pointOfInterestRequest: poiRequest)
            let search = MKLocalSearch(request: searchRequest)
            let response = try await search.start()

            for item in response.mapItems {
                let coord = item.placemark.coordinate
                if let cat = item.pointOfInterestCategory {
                    guard roadCategories.contains(cat) else { continue }
                }
                let key = dedupeKey(name: item.name, coordinate: coord)
                guard seen.insert(key).inserted else { continue }

                let off = MapGeometry.distanceFromRouteMeters(point: coord, polyline: coordinates)
                let detour = MapGeometry.detourMinutes(offRouteMeters: off)
                let progress = MapGeometry.routeProgressMeters(
                    point: coord,
                    polyline: coordinates,
                    cumulative: cumulative
                )

                candidates.append(
                    POICandidate(
                        mapItem: item,
                        routeProgressMeters: progress,
                        detourMinutes: detour
                    )
                )
            }
        }

        return candidates
    }

    private func dedupeKey(name: String?, coordinate: CLLocationCoordinate2D) -> String {
        let lat = String(format: "%.4f", coordinate.latitude)
        let lon = String(format: "%.4f", coordinate.longitude)
        let n = name ?? ""
        return "\(n)|\(lat)|\(lon)"
    }

    func packStops(candidates: [POICandidate], budgetMinutes: Double, defaultDwell: Double) -> [PlannedStop] {
        let sorted = candidates.sorted {
            if $0.routeProgressMeters != $1.routeProgressMeters {
                return $0.routeProgressMeters < $1.routeProgressMeters
            }
            return $0.detourMinutes < $1.detourMinutes
        }
        var used: Double = 0
        var result: [PlannedStop] = []
        var order = 1

        for c in sorted {
            let dwell = defaultDwell
            let cost = c.detourMinutes + dwell
            if used + cost <= budgetMinutes {
                let id = UUID()
                let name = c.mapItem.name ?? "Stop"
                let coord = c.mapItem.placemark.coordinate
                result.append(
                    PlannedStop(
                        id: id,
                        name: name,
                        coordinate: coord,
                        dwellMinutes: dwell,
                        detourMinutes: c.detourMinutes,
                        listOrder: order
                    )
                )
                used += cost
                order += 1
            }
        }
        return result
    }

    func defaultDwellMinutes() -> Double { defaultDwell }

    func collectCoolPOIsAround(center: CLLocationCoordinate2D, radiusMeters: CLLocationDistance) async throws -> [MKMapItem] {
        let cappedRadius = min(max(radiusMeters, 2_000), 45_000)
        let request = MKLocalPointsOfInterestRequest(center: center, radius: cappedRadius)
        request.pointOfInterestFilter = .includingAll
        let searchRequest = MKLocalSearch.Request(pointOfInterestRequest: request)
        let search = MKLocalSearch(request: searchRequest)
        let response = try await search.start()

        var seen = Set<String>()
        let startLoc = CLLocation(latitude: center.latitude, longitude: center.longitude)
        var items: [MKMapItem] = []

        for item in response.mapItems {
            let coord = item.placemark.coordinate
            if let cat = item.pointOfInterestCategory {
                guard coolCategories.contains(cat) else { continue }
            }
            guard CLLocation(latitude: coord.latitude, longitude: coord.longitude).distance(from: startLoc) > 400 else { continue }
            let key = dedupeKey(name: item.name, coordinate: coord)
            guard seen.insert(key).inserted else { continue }
            items.append(item)
        }
        return items
    }

    func findCoolDestinationWithinBudget(start: MKMapItem, maxTravelSeconds: TimeInterval) async throws -> (destination: MKMapItem, route: MKRoute) {
        guard maxTravelSeconds > 0 else { throw PartybusError.invalidBudget }

        let center = start.placemark.coordinate
        let hours = maxTravelSeconds / 3600
        let radiusMeters = min(max(hours * 65_000, 5_000), 45_000)

        var candidates = try await collectCoolPOIsAround(center: center, radiusMeters: radiusMeters)

        if candidates.count < 8 {
            let wider = try await collectCoolPOIsAround(center: center, radiusMeters: 45_000)
            var seen = Set(candidates.map { dedupeKey(name: $0.name, coordinate: $0.placemark.coordinate) })
            for item in wider where seen.insert(dedupeKey(name: item.name, coordinate: item.placemark.coordinate)).inserted {
                candidates.append(item)
            }
        }

        let startLoc = CLLocation(latitude: center.latitude, longitude: center.longitude)
        candidates.sort {
            startLoc.distance(from: CLLocation(latitude: $0.placemark.coordinate.latitude, longitude: $0.placemark.coordinate.longitude))
                < startLoc.distance(from: CLLocation(latitude: $1.placemark.coordinate.latitude, longitude: $1.placemark.coordinate.longitude))
        }

        var best: (MKMapItem, MKRoute)?
        let limit = min(candidates.count, 32)

        for i in 0..<limit {
            let item = candidates[i]
            do {
                let route = try await fetchDrivingRoute(from: start, to: item)
                guard route.expectedTravelTime <= maxTravelSeconds, route.expectedTravelTime > 0 else { continue }
                if best == nil || route.expectedTravelTime > best!.1.expectedTravelTime {
                    best = (item, route)
                }
            } catch {
                continue
            }
        }

        guard let result = best else {
            throw PartybusError.noDestinationWithinBudget
        }
        return result
    }
}
