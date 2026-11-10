import Foundation
import HealthKit
import WorkoutKit

// Development-only interoperability check. No app, signing account or schedule authorization.
@main
struct VerifyWorkout {
  struct Input: Decodable {
    let id: UUID
    let totalDistanceMeters: Double
    let stops: [Stop]
    struct Stop: Decodable {
      let distanceMeters: Double
      let reminder: String
    }
  }

  static func main() throws {
    guard CommandLine.arguments.count == 2 else {
      throw Failure(message: "Usage: verify-workout <fixture-directory>")
    }
    let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    let fixtures = try FileManager.default.contentsOfDirectory(
      at: directory, includingPropertiesForKeys: nil
    ).filter { $0.pathExtension == "json" }.sorted { $0.path < $1.path }
    guard !fixtures.isEmpty else { throw Failure(message: "No interoperability fixtures found") }
    for fixture in fixtures {
      let input = try JSONDecoder().decode(Input.self, from: Data(contentsOf: fixture))
      let raw = try Data(
        contentsOf: fixture.deletingPathExtension().appendingPathExtension("workout"))
      let parsed = try WorkoutPlan(from: raw)
      let nativePlan = FuelPlan(
        id: input.id, totalDistance: PlanDistance.stored(input.totalDistanceMeters),
        stops: input.stops.map {
          FuelStop(distance: PlanDistance.stored($0.distanceMeters), reminder: $0.reminder)
        })
      let expected = try nativePlan.workoutPlan(locale: Locale(identifier: "en_US_POSIX"))
      guard parsed == expected else {
        throw Failure(message: "Apple decoded a different workout: \(fixture.lastPathComponent)")
      }
      // Apple must also accept re-encoding and reading the result, beyond the initial parse.
      guard try WorkoutPlan(from: parsed.dataRepresentation) == expected else {
        throw Failure(message: "Apple round-trip differs: \(fixture.lastPathComponent)")
      }
      print(
        "PASS \(fixture.deletingPathExtension().lastPathComponent): \(raw.count) bytes, exact WorkoutPlan equality"
      )
    }
    print("All \(fixtures.count) JavaScript files passed Apple WorkoutKit interoperability.")
  }

  struct Failure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }
}
