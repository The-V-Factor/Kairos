import SwiftUI

struct FuelToken: View {
  var kind: FuelKind
  var theme: RideTheme
  var removing = false
  var arrivalEvent: UUID?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var appeared = false
  @State private var arrivalGeneration = 0

  var body: some View {
    let shouldReduceMotion = reduceMotion
    return Group {
      if kind == .water {
        ZStack {
          BottleOutline().fill(theme.surface)
          BottleWater(
            level: removing ? 0 : 0.67,
            tilt: arrivalEvent == nil || appeared || reduceMotion ? 0 : 0.12
          )
          .fill(
            (theme == .pocket
              ? Color(red: 0.65, green: 0.48, blue: 0.85) : theme.accent.opacity(0.65)).gradient
          )
          .animation(
            reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.5), value: appeared
          )
          .clipShape(BottleOutline())
          BottleOutline().stroke(theme.ink, lineWidth: 1.6)
          RoundedRectangle(cornerRadius: 2).fill(theme.ink).frame(width: 13, height: 5).offset(
            y: -20)
          Capsule().fill(theme.surface.opacity(0.8)).frame(width: 13, height: 6).offset(y: 4)
        }
      } else if kind == .gel {
        ZStack {
          UnevenRoundedRectangle(
            topLeadingRadius: 3, bottomLeadingRadius: 5, bottomTrailingRadius: 5,
            topTrailingRadius: 3
          )
          .fill(theme.detail.opacity(0.85))
          .padding(.top, 8)
          Rectangle().fill(theme.ink).frame(width: 13, height: 5).offset(y: -17)
          Text("GEL").font(.system(size: 8, weight: .black)).foregroundStyle(theme.surface)
        }
        .rotationEffect(.degrees(-9))
      } else {
        Image(systemName: "tag")
          .font(.system(size: 25, weight: .medium))
          .foregroundStyle(theme.accent)
      }
    }
    .frame(width: 29, height: 43)
    .rotationEffect(.degrees(removing && !reduceMotion ? 22 : 0))
    .offset(x: removing && !reduceMotion ? 12 : 0, y: removing && !reduceMotion ? -8 : 0)
    .scaleEffect(removing && !reduceMotion ? 0.82 : 1)
    .animation(reduceMotion ? .linear(duration: 0.1) : .easeInOut(duration: 0.36), value: removing)
    .keyframeAnimator(initialValue: 0.0, trigger: arrivalGeneration) { view, angle in
      view.rotationEffect(.degrees(shouldReduceMotion ? 0 : angle))
    } keyframes: { _ in
      CubicKeyframe(-12, duration: 0.1)
      CubicKeyframe(9, duration: 0.13)
      CubicKeyframe(-5, duration: 0.12)
      CubicKeyframe(0, duration: 0.15)
    }
    .onAppear {
      appeared = true
      if arrivalEvent != nil { arrivalGeneration += 1 }
    }
    .onChange(of: arrivalEvent) { _, newValue in
      if newValue != nil { arrivalGeneration += 1 }
    }
    .accessibilityHidden(true)
  }
}

private struct BottleOutline: Shape {
  func path(in rect: CGRect) -> Path {
    var p = Path()
    let w = rect.width
    let h = rect.height
    p.move(to: CGPoint(x: w * 0.32, y: 4))
    p.addLine(to: CGPoint(x: w * 0.68, y: 4))
    p.addLine(to: CGPoint(x: w * 0.68, y: h * 0.2))
    p.addQuadCurve(to: CGPoint(x: w * 0.93, y: h * 0.4), control: CGPoint(x: w * 0.93, y: h * 0.27))
    p.addLine(to: CGPoint(x: w * 0.93, y: h * 0.88))
    p.addQuadCurve(
      to: CGPoint(x: w * 0.75, y: h * 0.98), control: CGPoint(x: w * 0.93, y: h * 0.98))
    p.addLine(to: CGPoint(x: w * 0.25, y: h * 0.98))
    p.addQuadCurve(
      to: CGPoint(x: w * 0.07, y: h * 0.88), control: CGPoint(x: w * 0.07, y: h * 0.98))
    p.addLine(to: CGPoint(x: w * 0.07, y: h * 0.4))
    p.addQuadCurve(to: CGPoint(x: w * 0.32, y: h * 0.2), control: CGPoint(x: w * 0.07, y: h * 0.27))
    p.closeSubpath()
    return p
  }
}

private struct BottleWater: Shape {
  var level: CGFloat
  var tilt: CGFloat
  var animatableData: AnimatablePair<CGFloat, CGFloat> {
    get { AnimatablePair(level, tilt) }
    set {
      level = newValue.first
      tilt = newValue.second
    }
  }
  func path(in rect: CGRect) -> Path {
    let y = rect.height * (1 - level)
    var path = Path()
    path.move(to: CGPoint(x: 0, y: y + rect.height * tilt))
    path.addCurve(
      to: CGPoint(x: rect.width, y: y - rect.height * tilt),
      control1: CGPoint(x: rect.width * 0.35, y: y - rect.height * tilt),
      control2: CGPoint(x: rect.width * 0.65, y: y + rect.height * tilt))
    path.addLine(to: CGPoint(x: rect.width, y: rect.height))
    path.addLine(to: CGPoint(x: 0, y: rect.height))
    path.closeSubpath()
    return path
  }
}

struct TrailArtwork: View {
  var theme: RideTheme
  var body: some View {
    Canvas { context, size in
      let w = size.width
      let h = size.height
      var ribbon = Path()
      ribbon.move(to: CGPoint(x: -10, y: h * 0.8))
      ribbon.addCurve(
        to: CGPoint(x: w + 10, y: h * 0.65), control1: CGPoint(x: w * 0.25, y: h * 0.1),
        control2: CGPoint(x: w * 0.65, y: h * 1.25))
      context.stroke(
        ribbon, with: .color(theme.accent.opacity(0.12)),
        style: StrokeStyle(lineWidth: 24, lineCap: .round))
      for (index, x) in [w * 0.65, w * 0.79, w * 0.93].enumerated() {
        context.fill(
          Path(
            ellipseIn: CGRect(
              x: x - 4, y: h * 0.66 - 13 + CGFloat(index % 2) * 8, width: 8, height: 8)),
          with: .color(theme.detail.opacity(0.65)))
      }
    }
    .frame(height: 74)
    .overlay(alignment: .leading) {
      Image(systemName: "figure.outdoor.cycle")
        .font(.system(size: 58, weight: .regular))
        .foregroundStyle(theme.ink).padding(.leading, 30)
    }
    .accessibilityHidden(true)
  }
}

struct ThemePicker: View {
  @Binding var selected: RideTheme
  @Binding var haptics: Bool
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 14) {
          ForEach(RideTheme.allCases) { theme in
            Button {
              selected = theme
            } label: {
              HStack(spacing: 18) {
                ThemeThumbnail(theme: theme)
                VStack(alignment: .leading, spacing: 7) {
                  Text("\(theme.letter) · \(theme.title)").font(.headline)
                    .foregroundStyle(Color(red: 0.12, green: 0.14, blue: 0.16))
                  Text(theme.caption).font(.caption)
                    .foregroundStyle(Color(red: 0.30, green: 0.33, blue: 0.36))
                }
                Spacer(minLength: 0)
                Image(systemName: theme == selected ? "checkmark.circle.fill" : "circle")
                  .foregroundStyle(theme == selected ? Color.blue : Color.gray)
              }
              .padding(12)
              .background(Color.white, in: RoundedRectangle(cornerRadius: 22))
              .overlay(
                RoundedRectangle(cornerRadius: 22).strokeBorder(
                  theme == selected ? Color.blue : Color.clear, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(theme.title)，\(theme.caption)")
            .accessibilityAddTraits(theme == selected ? .isSelected : [])
          }
          Toggle("交互触感", isOn: $haptics).padding(.vertical, 12)
          Text("缩略图为示例计划。切换外观不会改变你的补给内容。")
            .font(.footnote).foregroundStyle(Color(red: 0.30, green: 0.33, blue: 0.36))
        }
        .padding(20)
      }
      .navigationTitle("选一种骑行气质")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
      .background(Color(uiColor: .systemGroupedBackground))
    }
    .preferredColorScheme(.light)
    .foregroundStyle(Color(red: 0.12, green: 0.14, blue: 0.16))
    .tint(.blue)
  }
}
