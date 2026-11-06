import Foundation
import Observation
import WorkoutKit

@MainActor @Observable
final class PlanStore {
  static let storageKey = "kairos.fuelPlan.v1"

  var plan: FuelPlan {
    didSet {
      submissionMessage = nil
      do {
        defaults.set(try JSONEncoder().encode(plan), forKey: Self.storageKey)
        storageMessage = nil
      } catch {
        storageMessage = "计划未能保存在本机：\(error.localizedDescription)"
      }
    }
  }
  private(set) var storageMessage: String?
  private(set) var submissionMessage: String?
  private(set) var isSending = false
  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    if let data = defaults.data(forKey: Self.storageKey) {
      do {
        plan = try JSONDecoder().decode(FuelPlan.self, from: data)
      } catch {
        plan = FuelPlan()
        storageMessage = "保存的计划无法读取。当前显示空白计划，编辑后将替换旧数据。"
      }
    } else {
      plan = FuelPlan()
    }
  }

  var validationMessage: String? {
    do {
      _ = try plan.points()
      return nil
    } catch {
      return error.localizedDescription
    }
  }

  func send() async {
    await send(using: WorkoutScheduler.shared)
  }

  func send(using scheduler: some WorkoutScheduling) async {
    guard !isSending else { return }
    isSending = true
    submissionMessage = nil
    defer { isSending = false }
    do {
      let workout = try plan.workoutPlan()
      try await WorkoutSubmission.submit(workout, using: scheduler)
      submissionMessage = "已提交到本机训练排程。请在 Apple Watch 的“体能训练”确认 Kairos 骑行补给计划，再手动启动；这不代表手表已收到。"
    } catch {
      submissionMessage = error.localizedDescription
    }
  }
}
