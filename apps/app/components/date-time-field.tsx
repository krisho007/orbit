import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

type FieldProps = {
  value: Date;
  onChange: (date: Date) => void;
  grow?: boolean;
};

export function DateField({ value, onChange, grow }: FieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (selected) onChange(selected);
  };

  return (
    <View className={grow ? "flex-1 mr-2" : undefined}>
      <Pressable
        onPress={() => setShowPicker(true)}
        className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
      >
        <Text className="text-typography-900 text-base">
          {format(value, "MMM d, yyyy")}
        </Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

export function TimeField({ value, onChange }: FieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (selected) onChange(selected);
  };

  return (
    <View>
      <Pressable
        onPress={() => setShowPicker(true)}
        className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
      >
        <Text className="text-typography-900 text-base">
          {format(value, "HH:mm")}
        </Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={value}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleChange}
        />
      )}
    </View>
  );
}
