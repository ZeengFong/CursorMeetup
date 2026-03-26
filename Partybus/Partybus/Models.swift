import Foundation
import MapKit

struct POICandidate: Identifiable {
    let id = UUID()
    let mapItem: MKMapItem
    /// Distance along the base polyline from the start (meters), for ordering.
    var routeProgressMeters: Double
    /// Rough extra driving time vs staying on the main route (minutes).
    var detourMinutes: Double
}

struct PlannedStop: Identifiable {
    let id: UUID
    var name: String
    var coordinate: CLLocationCoordinate2D
    /// Minutes spent at the stop (editable).
    var dwellMinutes: Double
    /// Rough extra driving time for this detour (minutes).
    var detourMinutes: Double
    var listOrder: Int

    var lineTotalMinutes: Double { detourMinutes + dwellMinutes }
}
