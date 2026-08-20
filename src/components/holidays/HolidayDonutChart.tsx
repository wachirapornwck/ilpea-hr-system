'use client';

// =============================================================================
// src/components/holidays/HolidayDonutChart.tsx
// =============================================================================
// Lightweight pure-SVG donut chart — no charting library is installed in this
// project (checked package.json), so this avoids adding a new dependency
// just for one chart, consistent with the project's existing preference for
// small hand-rolled utilities over heavier packages (e.g. the custom
// Firestore REST wrapper instead of the full Admin SDK).
// =============================================================================

interface DonutSegment {
  label: string;
  value: number;
  color: string; // tailwind color class base, e.g. 'rose', 'emerald'
  hex: string; // actual hex for the SVG stroke
}

interface Props {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: number;
}

export default function HolidayDonutChart({
  segments,
  centerLabel,
  centerValue,
}: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 60;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg
          width="150"
          height="150"
          viewBox="0 0 150 150"
          className="-rotate-90"
        >
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {segments.map((s, i) => {
            const fraction = s.value / total;
            const dash = fraction * circumference;
            const offset = -((cumulative / total) * circumference);
            cumulative += s.value;
            if (s.value === 0) return null;
            return (
              <circle
                key={i}
                cx="75"
                cy="75"
                r={radius}
                fill="none"
                stroke={s.hex}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">
            {centerValue}
          </span>
          <span className="text-[10px] text-gray-400 text-center leading-tight px-2">
            {centerLabel}
          </span>
        </div>
      </div>

      <div className="space-y-2 flex-1">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.hex }}
              />
              <span className="text-gray-600">{s.label}</span>
            </div>
            <span className="font-medium text-gray-900">{s.value} วัน</span>
          </div>
        ))}
      </div>
    </div>
  );
}
