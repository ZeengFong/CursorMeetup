import SwiftUI
import MapKit

private enum TripMode: String, CaseIterable {
    case roadTrip = "Along route"
    case dayTrip = "Somewhere cool"
}

struct ContentView: View {
    @State private var tripMode: TripMode = .roadTrip

    @State private var fromQuery = ""
    @State private var toQuery = ""
    @State private var budgetText = "30"

    @State private var coolStartQuery = ""
    @State private var coolMaxMinutesText = "45"

    @State private var routeCoordinates: [CLLocationCoordinate2D] = []
    @State private var baseTravelTime: TimeInterval?
    @State private var baseDistance: CLLocationDistance?
    @State private var plannedStops: [PlannedStop] = []
    @State private var dayTripDestinationCoord: CLLocationCoordinate2D?
    @State private var dayTripDestinationTitle: String?
    @State private var mapPosition: MapCameraPosition = .automatic

    @State private var isLoading = false
    @State private var loadingMessage = "Planning route…"
    @State private var alertMessage: String?

    private let planner = RoutePlanningService()

    private var parsedBudget: Double {
        Double(budgetText.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    private var parsedCoolMaxMinutes: Double {
        Double(coolMaxMinutesText.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    private var usedMinutesTotal: Double {
        plannedStops.reduce(0) { $0 + $1.lineTotalMinutes }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                formSection
                Divider()
                mapSection
                Divider()
                bottomSection
            }
            .navigationTitle("Partybus")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Something went wrong", isPresented: Binding(
                get: { alertMessage != nil },
                set: { if !$0 { alertMessage = nil } }
            )) {
                Button("OK", role: .cancel) { alertMessage = nil }
            } message: {
                Text(alertMessage ?? "")
            }
            .onChange(of: tripMode) { _, newMode in
                routeCoordinates = []
                baseTravelTime = nil
                baseDistance = nil
                if newMode == .roadTrip {
                    dayTripDestinationCoord = nil
                    dayTripDestinationTitle = nil
                } else {
                    plannedStops = []
                }
            }
        }
    }

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Mode", selection: $tripMode) {
                ForEach(TripMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            switch tripMode {
            case .roadTrip:
                TextField("From", text: $fromQuery)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.words)
                TextField("To", text: $toQuery)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.words)
                HStack {
                    Text("Stops time budget (min)")
                    TextField("30", text: $budgetText)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 80)
                    Spacer()
                    Button(action: planRoadTrip) {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Plan")
                                .fontWeight(.semibold)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isLoading)
                }
            case .dayTrip:
                TextField("Starting point", text: $coolStartQuery)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.words)
                HStack {
                    Text("Max drive time (min)")
                    TextField("45", text: $coolMaxMinutesText)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 80)
                    Spacer()
                    Button(action: planDayTrip) {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Suggest")
                                .fontWeight(.semibold)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isLoading)
                }
                Text("Finds a landmark, park, museum, or similar spot you can reach within that drive.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let t = baseTravelTime, let d = baseDistance {
                Text(routeSummaryLine(duration: t, distance: d))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private func routeSummaryLine(duration: TimeInterval, distance: CLLocationDistance) -> String {
        if tripMode == .dayTrip, let name = dayTripDestinationTitle {
            return "Suggested: \(name) · \(formatDuration(duration)) · \(formatDistance(distance))"
        }
        return "Base route: \(formatDuration(duration)) · \(formatDistance(distance))"
    }

    private var mapSection: some View {
        ZStack {
            Map(position: $mapPosition) {
                if routeCoordinates.count >= 2 {
                    MapPolyline(coordinates: routeCoordinates)
                        .stroke(.blue, lineWidth: 5)
                }
                ForEach(Array(plannedStops.enumerated()), id: \.element.id) { index, stop in
                    Annotation(stop.name, coordinate: stop.coordinate) {
                        ZStack {
                            Circle()
                                .fill(Color.orange)
                                .frame(width: 28, height: 28)
                            Text("\(index + 1)")
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                        }
                    }
                }
                if let coord = dayTripDestinationCoord, let title = dayTripDestinationTitle {
                    Annotation(title, coordinate: coord) {
                        Image(systemName: "star.circle.fill")
                            .font(.title)
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .green)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))

            if isLoading {
                ZStack {
                    Color.black.opacity(0.12)
                    VStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(1.2)
                        Text(loadingMessage)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(20)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
                .allowsHitTesting(true)
            }
        }
        .frame(minHeight: 220)
    }

    private var bottomSection: some View {
        Group {
            switch tripMode {
            case .roadTrip:
                roadTripStopsSection
            case .dayTrip:
                dayTripHintSection
            }
        }
    }

    private var roadTripStopsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Stops")
                    .font(.headline)
                Spacer()
                if routeCoordinates.count >= 2 {
                    Text("\(Int(round(usedMinutesTotal))) / \(Int(round(parsedBudget))) min")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(usedMinutesTotal > parsedBudget ? .red : .secondary)
                }
            }
            .padding(.horizontal)

            if plannedStops.isEmpty && !isLoading && routeCoordinates.isEmpty {
                Text("Plan a route to see suggested stops within your time budget.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            } else if plannedStops.isEmpty && !isLoading && routeCoordinates.count >= 2 {
                Text("No stops fit your budget along this route. Try a larger time budget.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            } else if !plannedStops.isEmpty {
                List {
                    ForEach($plannedStops) { $stop in
                        if let idx = plannedStops.firstIndex(where: { $0.id == stop.id }) {
                            StopRowView(
                                stop: $stop,
                                index: idx,
                                budget: parsedBudget,
                                allStops: plannedStops,
                                onFocus: { focusMap(on: stop) }
                            )
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .frame(maxHeight: 320)
    }

    private var dayTripHintSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Day trip")
                .font(.headline)
                .padding(.horizontal)
            if dayTripDestinationTitle == nil && routeCoordinates.isEmpty && !isLoading {
                Text("Enter where you are leaving from and how long you are willing to drive. We will suggest a spot.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            } else if dayTripDestinationTitle != nil && !isLoading {
                Text("Route follows roads to the suggested place. Try another city or a longer drive time if results are thin.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }
            Spacer(minLength: 0)
        }
        .frame(maxHeight: 320)
    }

    private func planRoadTrip() {
        Task {
            loadingMessage = "Planning route…"
            isLoading = true
            defer { isLoading = false }
            do {
                let budget = Double(budgetText.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) ?? 0
                guard budget > 0 else {
                    throw PartybusError.invalidBudget
                }

                let fromTrim = fromQuery.trimmingCharacters(in: .whitespacesAndNewlines)
                let toTrim = toQuery.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !fromTrim.isEmpty, !toTrim.isEmpty else {
                    throw PartybusError.emptyField("Enter both origin and destination.")
                }

                dayTripDestinationCoord = nil
                dayTripDestinationTitle = nil

                async let fromItem = planner.geocode(fromQuery)
                async let toItem = planner.geocode(toQuery)
                let route = try await planner.fetchDrivingRoute(from: try await fromItem, to: try await toItem)

                let poly = route.polyline
                let coords = MapGeometry.coordinates(from: poly)
                let cumulative = MapGeometry.cumulativeDistances(for: coords)

                let candidates = try await planner.collectPOICandidates(along: coords, cumulative: cumulative)
                let packed = planner.packStops(candidates: candidates, budgetMinutes: budget, defaultDwell: planner.defaultDwellMinutes())

                routeCoordinates = coords
                baseTravelTime = route.expectedTravelTime
                baseDistance = route.distance
                plannedStops = packed.enumerated().map { i, s in
                    var x = s
                    x.listOrder = i + 1
                    return x
                }

                fitMap(to: coords, stops: packed)
            } catch {
                alertMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    private func planDayTrip() {
        Task {
            loadingMessage = "Finding a cool spot…"
            isLoading = true
            defer { isLoading = false }
            do {
                let maxMin = parsedCoolMaxMinutes
                guard maxMin > 0 else { throw PartybusError.invalidBudget }

                let startTrim = coolStartQuery.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !startTrim.isEmpty else {
                    throw PartybusError.emptyField("Enter a starting point.")
                }

                plannedStops = []
                let startItem = try await planner.geocode(coolStartQuery)
                let maxSeconds = maxMin * 60
                let (dest, route) = try await planner.findCoolDestinationWithinBudget(
                    start: startItem,
                    maxTravelSeconds: maxSeconds
                )

                let coords = MapGeometry.coordinates(from: route.polyline)
                routeCoordinates = coords
                baseTravelTime = route.expectedTravelTime
                baseDistance = route.distance
                dayTripDestinationTitle = dest.name ?? "Destination"
                dayTripDestinationCoord = dest.location.coordinate

                fitMap(to: coords, stops: [])
            } catch {
                alertMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    private func fitMap(to coordinates: [CLLocationCoordinate2D], stops: [PlannedStop]) {
        guard let first = coordinates.first else { return }
        var minLat = first.latitude
        var maxLat = first.latitude
        var minLon = first.longitude
        var maxLon = first.longitude
        for c in coordinates {
            minLat = min(minLat, c.latitude)
            maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude)
            maxLon = max(maxLon, c.longitude)
        }
        for s in stops {
            minLat = min(minLat, s.coordinate.latitude)
            maxLat = max(maxLat, s.coordinate.latitude)
            minLon = min(minLon, s.coordinate.longitude)
            maxLon = max(maxLon, s.coordinate.longitude)
        }
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.4, 0.02),
            longitudeDelta: max((maxLon - minLon) * 1.4, 0.02)
        )
        mapPosition = .region(MKCoordinateRegion(center: center, span: span))
    }

    private func focusMap(on stop: PlannedStop) {
        let span = MKCoordinateSpan(latitudeDelta: 0.04, longitudeDelta: 0.04)
        mapPosition = .region(MKCoordinateRegion(center: stop.coordinate, span: span))
    }

    private func formatDuration(_ t: TimeInterval) -> String {
        let m = Int((t / 60).rounded())
        if m >= 60 {
            let h = m / 60
            let rem = m % 60
            return rem > 0 ? "\(h) hr \(rem) min" : "\(h) hr"
        }
        return "\(m) min"
    }

    private func formatDistance(_ d: CLLocationDistance) -> String {
        if d >= 1000 {
            return String(format: "%.1f km", d / 1000)
        }
        return String(format: "%.0f m", d)
    }
}

#Preview {
    ContentView()
}
