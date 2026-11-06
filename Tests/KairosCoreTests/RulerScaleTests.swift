import Testing

@testable import KairosCore

@Test(arguments: [
  (85_000.0, 20_000.0), (42_500, 10_000), (200_000, 50_000),
  (10_000, 5_000), (5_000, 1_000), (850, 200), (100, 50), (1, 1),
])
func rulerLabelsAdaptToVisibleDistance(_ example: (Double, Double)) {
  #expect(RulerScale.majorInterval(visibleMeters: example.0) == example.1)
}

@Test func rulerIntervalsStayFiniteAndUseWholeMeters() {
  for extent in [
    0.0, -1, .infinity, .nan, 0.1, 17, 379, 33_333, 987_654, Double.greatestFiniteMagnitude,
  ] {
    let interval = RulerScale.majorInterval(visibleMeters: extent)
    #expect(interval.isFinite && interval >= 1 && interval.rounded() == interval)
  }
}
