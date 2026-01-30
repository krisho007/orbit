"use client";

import React, { createContext, useContext, useState } from "react";
import {
  View,
  TextInput,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

// Input container styles
const inputContainerStyle = tv({
  base: "flex-row items-center border rounded-lg bg-background-0",
  variants: {
    variant: {
      outline: "border-border-300",
      underlined: "border-b border-t-0 border-l-0 border-r-0 rounded-none border-border-300",
      rounded: "border-border-300 rounded-full",
    },
    size: {
      sm: "h-9 px-3",
      md: "h-10 px-3",
      lg: "h-11 px-4",
      xl: "h-12 px-4",
    },
    isFocused: {
      true: "border-primary-500",
      false: "",
    },
    isInvalid: {
      true: "border-error-500",
      false: "",
    },
    isDisabled: {
      true: "opacity-50 bg-background-50",
      false: "",
    },
    isReadOnly: {
      true: "bg-background-50",
      false: "",
    },
  },
  compoundVariants: [
    {
      isFocused: true,
      isInvalid: true,
      class: "border-error-500",
    },
  ],
  defaultVariants: {
    variant: "outline",
    size: "md",
    isFocused: false,
    isInvalid: false,
    isDisabled: false,
    isReadOnly: false,
  },
});

// Input field styles
const inputFieldStyle = tv({
  base: "flex-1 text-typography-900 py-0",
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-base",
      xl: "text-lg",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

// Context for sharing input state
type InputContextType = {
  variant?: "outline" | "underlined" | "rounded";
  size?: "sm" | "md" | "lg" | "xl";
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isInvalid?: boolean;
  isFocused?: boolean;
  setIsFocused?: (focused: boolean) => void;
};
const InputContext = createContext<InputContextType>({});

// Input container component
export interface InputProps
  extends ViewProps,
    VariantProps<typeof inputContainerStyle> {
  className?: string;
  children?: React.ReactNode;
}

export function Input({
  children,
  variant = "outline",
  size = "md",
  isDisabled = false,
  isReadOnly = false,
  isInvalid = false,
  className,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <InputContext.Provider
      value={{ variant, size, isDisabled, isReadOnly, isInvalid, isFocused, setIsFocused }}
    >
      <View
        className={inputContainerStyle({
          variant,
          size,
          isFocused,
          isInvalid,
          isDisabled,
          isReadOnly,
          class: className,
        })}
        {...props}
      >
        {children}
      </View>
    </InputContext.Provider>
  );
}

// Input field component
export interface InputFieldProps extends TextInputProps {
  className?: string;
  type?: "text" | "password";
}

export function InputField({
  className,
  type = "text",
  onFocus,
  onBlur,
  ...props
}: InputFieldProps) {
  const { size, isDisabled, isReadOnly, setIsFocused } = useContext(InputContext);

  return (
    <TextInput
      className={inputFieldStyle({ size, class: className })}
      editable={!isDisabled && !isReadOnly}
      secureTextEntry={type === "password"}
      placeholderTextColor="#94A3B8"
      onFocus={(e) => {
        setIsFocused?.(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused?.(false);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}

// Input slot component (for icons, etc.)
export interface InputSlotProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

export function InputSlot({ className, children, ...props }: InputSlotProps) {
  return (
    <View className={`justify-center ${className}`} {...props}>
      {children}
    </View>
  );
}

// Input icon component
export interface InputIconProps {
  as: React.ComponentType<{ className?: string; color?: string; size?: number }>;
  className?: string;
}

export function InputIcon({ as: Icon, className }: InputIconProps) {
  const { isInvalid, isFocused } = useContext(InputContext);
  
  const getIconColor = () => {
    if (isInvalid) return "#DC2626";
    if (isFocused) return "#4F46E5";
    return "#94A3B8";
  };

  return (
    <View className={className}>
      <Icon size={18} color={getIconColor()} />
    </View>
  );
}
