import { format } from "date-fns";

type FieldProps = {
  value: Date;
  onChange: (date: Date) => void;
  grow?: boolean;
};

const base: React.CSSProperties = {
  padding: "12px 16px",
  backgroundColor: "#F9FAFB",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  fontSize: 16,
  color: "#111827",
  outline: "none",
  fontFamily: "inherit",
};

export function DateField({ value, onChange, grow }: FieldProps) {
  return (
    <input
      type="date"
      value={format(value, "yyyy-MM-dd")}
      onChange={(e) => {
        const text = e.target.value;
        if (text) {
          const [year, month, day] = text.split("-").map(Number);
          const d = new Date(value);
          d.setFullYear(year, month - 1, day);
          if (!isNaN(d.getTime())) onChange(new Date(d));
        }
      }}
      style={grow ? { ...base, flex: 1, marginRight: 8 } : base}
    />
  );
}

export function TimeField({ value, onChange }: FieldProps) {
  return (
    <input
      type="time"
      value={format(value, "HH:mm")}
      onChange={(e) => {
        const text = e.target.value;
        if (text) {
          const [hours, minutes] = text.split(":").map(Number);
          const d = new Date(value);
          d.setHours(hours, minutes);
          if (!isNaN(d.getTime())) onChange(new Date(d));
        }
      }}
      style={base}
    />
  );
}
