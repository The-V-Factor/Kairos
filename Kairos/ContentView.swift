import SwiftUI

struct ContentView: View {
  @State private var store = PlanStore()
  @State private var showingPreview = false
  @State private var showingHelp = false
  @FocusState private var editing: Bool
  @ScaledMetric(relativeTo: .largeTitle) private var distanceFontSize = 42

  private var points: [FuelPoint]? { try? store.plan.points() }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 26) {
          overview
          Picker("计划显示方式", selection: $showingPreview) {
            Text("编辑计划").tag(false)
            Text("里程预览").tag(true)
          }
          .pickerStyle(.segmented)
          .onChange(of: showingPreview) { editing = false }

          if showingPreview {
            preview
          } else {
            editor
          }

          Label("最后一次补给后，继续自由骑行。", systemImage: "infinity")
            .font(.footnote)
            .foregroundStyle(RidePalette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .frame(maxWidth: 600)
        .frame(maxWidth: .infinity)
      }
      .background(RidePalette.canvas)
      .scrollDismissesKeyboard(.interactively)
      .safeAreaInset(edge: .top, spacing: 0) {
        masthead
          .padding(.horizontal, 24)
          .padding(.top, 8)
          .padding(.bottom, 12)
          .frame(maxWidth: 600)
          .frame(maxWidth: .infinity)
          .background(RidePalette.canvas)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) { sendDock }
      .toolbar(.hidden, for: .navigationBar)
      .toolbar {
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button("完成") { editing = false }
        }
      }
      .sheet(isPresented: $showingHelp) { help }
      .tint(RidePalette.accent)
    }
  }

  private var masthead: some View {
    HStack(spacing: 10) {
      Image(systemName: "bicycle")
        .font(.title3.weight(.semibold))
        .foregroundStyle(RidePalette.accent)
        .accessibilityHidden(true)
      Text("KAIROS")
        .font(.caption.weight(.bold))
        .tracking(3)
      Spacer()
      Button {
        editing = false
        showingHelp = true
      } label: {
        Image(systemName: "questionmark")
          .font(.callout.weight(.semibold))
          .frame(width: 44, height: 44)
          .background(RidePalette.surface, in: Circle())
      }
      .accessibilityLabel("使用说明")
    }
  }

  private var overview: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 6) {
        Text("为下一程，补给。")
          .font(.system(.largeTitle, design: .rounded).weight(.bold))
          .accessibilityAddTraits(.isHeader)
        Text("出发前安排好，骑行时交给手表。")
          .font(.subheadline)
          .foregroundStyle(RidePalette.muted)
      }

      HStack(alignment: .center, spacing: 16) {
        VStack(alignment: .leading, spacing: 4) {
          Text("最后补给里程")
            .font(.caption)
            .foregroundStyle(RidePalette.muted)
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(points?.last.map { distanceParts($0.cumulativeMeters).value } ?? "—")
              .font(.system(size: distanceFontSize, weight: .semibold, design: .rounded))
              .monospacedDigit()
              .lineLimit(1)
              .minimumScaleFactor(0.5)
            if let last = points?.last {
              Text(distanceParts(last.cumulativeMeters).unit)
                .font(.callout)
                .foregroundStyle(RidePalette.muted)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Rectangle()
          .fill(RidePalette.accent.opacity(0.15))
          .frame(width: 1, height: 46)
        VStack(alignment: .leading, spacing: 4) {
          Text("\(store.plan.segments.count)")
            .font(.system(.title, design: .rounded).weight(.semibold))
            .monospacedDigit()
          Text("补给点")
            .font(.caption)
            .foregroundStyle(RidePalette.muted)
        }
      }
      .foregroundStyle(RidePalette.accent)
      .padding(20)
      .background(RidePalette.softAccent, in: RoundedRectangle(cornerRadius: 22))
    }
  }

  private var editor: some View {
    @Bindable var store = store
    return VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("你的补给点").font(.headline)
        Spacer()
        Text("按骑行顺序").font(.caption).foregroundStyle(RidePalette.muted)
      }
      if store.plan.segments.isEmpty {
        Text("先添加一个补给点，安排第一段骑行。")
          .font(.subheadline)
          .foregroundStyle(RidePalette.muted)
          .padding(.vertical, 12)
      }
      ForEach($store.plan.segments) { $segment in
        segmentCard($segment, index: segmentIndex(segment.id))
      }
      Button {
        store.plan.segments.append(FuelSegment())
      } label: {
        Label("添加补给点", systemImage: "plus")
          .font(.subheadline.weight(.semibold))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 17)
          .background(
            RoundedRectangle(cornerRadius: 18)
              .strokeBorder(
                RidePalette.accent.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
          )
      }
      .buttonStyle(.plain)
      .foregroundStyle(RidePalette.accent)
      .accessibilityIdentifier("addSegment")
      Text("距离填写本段长度；累计里程会自动计算。")
        .font(.caption)
        .foregroundStyle(RidePalette.muted)
    }
    .disabled(store.isSending)
  }

  private func segmentCard(_ segment: Binding<FuelSegment>, index: Int) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        pointNumber(index + 1)
        Text("补给点 \(index + 1)").font(.subheadline.weight(.semibold))
        Spacer()
        Button {
          editing = false
          let id = segment.wrappedValue.id
          store.plan.segments.removeAll { $0.id == id }
        } label: {
          Image(systemName: "minus.circle")
            .font(.title3)
            .foregroundStyle(RidePalette.muted)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("删除第 \(index + 1) 个补给点")
      }

      VStack(alignment: .leading, spacing: 7) {
        Text("本段距离").font(.caption).foregroundStyle(RidePalette.muted)
        HStack(alignment: .firstTextBaseline) {
          TextField("输入距离", text: segment.distance)
            .font(.system(.title2, design: .rounded).weight(.medium))
            .monospacedDigit()
            .keyboardType(.decimalPad)
            .focused($editing)
            .accessibilityLabel("第 \(index + 1) 段距离，单位米")
          Text("米").font(.subheadline).foregroundStyle(RidePalette.muted)
        }
        .padding(14)
        .background(RidePalette.inset, in: RoundedRectangle(cornerRadius: 12))
      }
      VStack(alignment: .leading, spacing: 7) {
        Text("到点提醒").font(.caption).foregroundStyle(RidePalette.muted)
        TextField("例如：吃一包胶、喝水", text: segment.reminder, axis: .vertical)
          .font(.body)
          .focused($editing)
          .lineLimit(1...4)
          .padding(14)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(RidePalette.inset, in: RoundedRectangle(cornerRadius: 12))
          .accessibilityLabel("第 \(index + 1) 段到点提示")
      }
    }
    .padding(18)
    .background(RidePalette.surface, in: RoundedRectangle(cornerRadius: 22))
  }

  private var preview: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 5) {
        Text("一路上的补给").font(.headline)
        Text("按实际累计骑行里程提醒。")
          .font(.caption)
          .foregroundStyle(RidePalette.muted)
      }
      if let points {
        VStack(spacing: 0) {
          ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
            HStack(alignment: .top, spacing: 14) {
              pointNumber(index + 1)
              VStack(alignment: .leading, spacing: 7) {
                Text("累计 \(distanceLabel(point.cumulativeMeters))")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(RidePalette.accent)
                Text(point.reminder).font(.title3.weight(.medium))
                Text("本段 \(distanceLabel(point.distanceMeters))")
                  .font(.caption)
                  .foregroundStyle(RidePalette.muted)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(18)
            if index < points.count - 1 {
              Divider().padding(.leading, 66)
            }
          }
        }
        .background(RidePalette.surface, in: RoundedRectangle(cornerRadius: 22))
      } else {
        VStack(alignment: .leading, spacing: 10) {
          Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
            .font(.title)
            .foregroundStyle(RidePalette.accent)
          Text("你的补给计划，从第一段开始。")
            .font(.body.weight(.medium))
          Text(store.validationMessage ?? "请先填写补给点。")
            .font(.subheadline)
            .foregroundStyle(RidePalette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(RidePalette.surface, in: RoundedRectangle(cornerRadius: 22))
      }
    }
  }

  private var sendDock: some View {
    VStack(spacing: 10) {
      if let message = store.submissionMessage ?? store.storageMessage {
        Text(message)
          .font(.footnote)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("submissionMessage")
      }
      if let message = store.validationMessage {
        Label(message, systemImage: "exclamationmark.circle")
          .font(.footnote)
          .foregroundStyle(RidePalette.warning)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Button {
        editing = false
        Task { await store.send() }
      } label: {
        HStack(spacing: 10) {
          if store.isSending {
            ProgressView().tint(RidePalette.onAccent)
          } else {
            Image(systemName: "applewatch")
          }
          Text(store.isSending ? "正在提交…" : "发送到 Apple Watch")
            .font(.body.weight(.semibold))
          Spacer(minLength: 0)
          Image(systemName: "arrow.up.right")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .foregroundStyle(
          store.validationMessage == nil ? RidePalette.onAccent : RidePalette.muted
        )
        .background(
          store.validationMessage == nil ? RidePalette.accent : RidePalette.softAccent,
          in: RoundedRectangle(cornerRadius: 18)
        )
      }
      .buttonStyle(.plain)
      .disabled(store.isSending || store.validationMessage != nil)
      .accessibilityIdentifier("sendPlan")
      Text("在 Apple 系统“体能训练”中开始骑行")
        .font(.caption2)
        .foregroundStyle(RidePalette.muted)
    }
    .padding(.horizontal, 24)
    .padding(.top, 14)
    .padding(.bottom, 10)
    .frame(maxWidth: 600)
    .frame(maxWidth: .infinity)
    .background(RidePalette.canvas)
    .overlay(alignment: .top) { Divider().opacity(0.5) }
  }

  private var help: some View {
    NavigationStack {
      List {
        Section("出发前") {
          Label("输入每段距离和到点提醒，核对里程预览。", systemImage: "1.circle")
          Label("发送计划，按系统提示允许训练排程。", systemImage: "2.circle")
          Label("在手表体能训练中找到 Kairos 骑行补给，确认后手动开始。", systemImage: "3.circle")
        }
        Section("使用条件") {
          Text("iPhone 需要 iOS 18+，配对的 Apple Watch 需要 watchOS 11+。")
          Text("本机提交不代表手表已收到，请在手表确认。修改计划后需要重新发送。")
          Text("距离使用米，小数按系统格式输入，不使用千位分隔符。")
          Text("里程依据实际骑行距离，不是路线上的地点；最后一次补给后可继续骑行。")
          Text("提示文字、声音和震动效果需要真机确认。")
        }
      }
      .navigationTitle("使用说明")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("完成") { showingHelp = false }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  private func pointNumber(_ number: Int) -> some View {
    Text(number.formatted(.number.precision(.integerLength(2...))))
      .font(.caption.weight(.bold).monospacedDigit())
      .foregroundStyle(RidePalette.accent)
      .frame(width: 32, height: 32)
      .background(RidePalette.softAccent, in: Circle())
      .accessibilityHidden(true)
  }

  private func segmentIndex(_ id: UUID) -> Int {
    store.plan.segments.firstIndex(where: { $0.id == id }) ?? 0
  }

  private func distanceParts(_ meters: Double) -> (value: String, unit: String) {
    let kilometers = meters >= 1000
    let value = kilometers ? meters / 1000 : meters
    return (value.formatted(.number.precision(.significantDigits(1...15))), kilometers ? "公里" : "米")
  }

  private func distanceLabel(_ meters: Double) -> String {
    let parts = distanceParts(meters)
    return "\(parts.value) \(parts.unit)"
  }
}
