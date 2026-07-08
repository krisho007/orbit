import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { getThemeColor, useThemeColors } from "../lib/theme";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <View
          style={{ backgroundColor: getThemeColor(colors, "background-0") }}
          className="rounded-3xl p-6 w-full max-w-md"
        >
          <Text
            style={{ color: getThemeColor(colors, "typography-900") }}
            className="text-lg font-body-semibold mb-2"
          >
            {title}
          </Text>
          <Text
            style={{ color: getThemeColor(colors, "typography-700") }}
            className="text-sm leading-5 mb-6"
          >
            {message}
          </Text>

          <View className="flex-row justify-end">
            <Pressable
              onPress={onCancel}
              className="px-5 py-3 rounded-xl mr-3 active:bg-background-100"
            >
              <Text
                style={{ color: getThemeColor(colors, "typography-600") }}
                className="text-sm font-body-medium"
              >
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{
                backgroundColor: destructive
                  ? getThemeColor(colors, "error-600")
                  : getThemeColor(colors, "primary-600"),
              }}
              className="px-5 py-3 rounded-xl"
            >
              <Text
                style={{ color: "#fff" }}
                className="text-sm font-body-semibold"
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmOptions & { visible: boolean }>({
    visible: false,
    title: "",
    message: "",
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, visible: true });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const ConfirmDialogElement = (
    <ConfirmDialog
      visible={state.visible}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, ConfirmDialogElement };
}
