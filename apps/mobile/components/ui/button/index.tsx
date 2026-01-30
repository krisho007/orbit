"use client";

import React, { createContext, useContext } from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

// Button styles using tailwind-variants
const buttonStyle = tv({
  base: "flex-row items-center justify-center rounded-lg border",
  variants: {
    action: {
      primary:
        "bg-primary-500 border-primary-500 active:bg-primary-700 active:border-primary-700",
      secondary:
        "bg-secondary-500 border-secondary-500 active:bg-secondary-700 active:border-secondary-700",
      positive:
        "bg-success-500 border-success-500 active:bg-success-700 active:border-success-700",
      negative:
        "bg-error-500 border-error-500 active:bg-error-700 active:border-error-700",
      default: "bg-transparent border-transparent active:bg-background-100",
    },
    variant: {
      solid: "",
      outline: "bg-transparent active:bg-background-50",
      link: "bg-transparent border-transparent px-0",
    },
    size: {
      xs: "px-3 h-8",
      sm: "px-4 h-9",
      md: "px-5 h-10",
      lg: "px-6 h-11",
      xl: "px-7 h-12",
    },
    isDisabled: {
      true: "opacity-50",
      false: "",
    },
  },
  compoundVariants: [
    // Primary outline
    {
      action: "primary",
      variant: "outline",
      class: "bg-transparent border-primary-500 active:bg-primary-50",
    },
    // Secondary outline
    {
      action: "secondary",
      variant: "outline",
      class: "bg-transparent border-secondary-400 active:bg-secondary-50",
    },
    // Positive outline
    {
      action: "positive",
      variant: "outline",
      class: "bg-transparent border-success-500 active:bg-success-50",
    },
    // Negative outline
    {
      action: "negative",
      variant: "outline",
      class: "bg-transparent border-error-500 active:bg-error-50",
    },
    // Primary link
    {
      action: "primary",
      variant: "link",
      class: "bg-transparent active:bg-transparent",
    },
    // Secondary link
    {
      action: "secondary",
      variant: "link",
      class: "bg-transparent active:bg-transparent",
    },
  ],
  defaultVariants: {
    action: "primary",
    variant: "solid",
    size: "md",
    isDisabled: false,
  },
});

// Button text styles
const buttonTextStyle = tv({
  base: "font-semibold",
  variants: {
    action: {
      primary: "text-typography-0",
      secondary: "text-typography-0",
      positive: "text-typography-0",
      negative: "text-typography-0",
      default: "text-typography-900",
    },
    variant: {
      solid: "",
      outline: "",
      link: "underline",
    },
    size: {
      xs: "text-xs",
      sm: "text-sm",
      md: "text-sm",
      lg: "text-base",
      xl: "text-lg",
    },
  },
  compoundVariants: [
    // Outline variants - use action color
    { action: "primary", variant: "outline", class: "text-primary-500" },
    { action: "secondary", variant: "outline", class: "text-secondary-600" },
    { action: "positive", variant: "outline", class: "text-success-600" },
    { action: "negative", variant: "outline", class: "text-error-600" },
    // Link variants - use action color
    { action: "primary", variant: "link", class: "text-primary-500" },
    { action: "secondary", variant: "link", class: "text-secondary-600" },
    { action: "positive", variant: "link", class: "text-success-600" },
    { action: "negative", variant: "link", class: "text-error-600" },
  ],
  defaultVariants: {
    action: "primary",
    variant: "solid",
    size: "md",
  },
});

// Context for sharing button props with children
type ButtonContextType = VariantProps<typeof buttonStyle>;
const ButtonContext = createContext<ButtonContextType>({});

// Button component
export interface ButtonProps
  extends Omit<PressableProps, "disabled">,
    VariantProps<typeof buttonStyle> {
  className?: string;
  isDisabled?: boolean;
}

export function Button({
  children,
  action = "primary",
  variant = "solid",
  size = "md",
  isDisabled = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <ButtonContext.Provider value={{ action, variant, size }}>
      <Pressable
        disabled={isDisabled}
        className={buttonStyle({ action, variant, size, isDisabled, class: className })}
        {...props}
      >
        {children}
      </Pressable>
    </ButtonContext.Provider>
  );
}

// ButtonText component
export interface ButtonTextProps {
  children: React.ReactNode;
  className?: string;
}

export function ButtonText({ children, className }: ButtonTextProps) {
  const { action, variant, size } = useContext(ButtonContext);

  return (
    <Text className={buttonTextStyle({ action, variant, size, class: className })}>
      {children}
    </Text>
  );
}

// ButtonIcon component
export interface ButtonIconProps {
  as: React.ComponentType<{ className?: string; color?: string; size?: number }>;
  className?: string;
}

export function ButtonIcon({ as: Icon, className }: ButtonIconProps) {
  const { action, variant, size } = useContext(ButtonContext);
  
  // Determine icon size based on button size
  const iconSizeMap = {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 22,
  };
  const iconSize = iconSizeMap[size || "md"];

  // Determine color based on action and variant
  const getIconColor = () => {
    if (variant === "solid") {
      return "#FFFFFF";
    }
    const colorMap = {
      primary: "#4F46E5",
      secondary: "#475569",
      positive: "#16A34A",
      negative: "#DC2626",
      default: "#0F172A",
    };
    return colorMap[action || "primary"];
  };

  return (
    <View className={className}>
      <Icon size={iconSize} color={getIconColor()} />
    </View>
  );
}

// ButtonSpinner component
export interface ButtonSpinnerProps {
  className?: string;
}

export function ButtonSpinner({ className }: ButtonSpinnerProps) {
  const { action, variant } = useContext(ButtonContext);

  // Determine spinner color
  const getSpinnerColor = () => {
    if (variant === "solid") {
      return "#FFFFFF";
    }
    const colorMap = {
      primary: "#4F46E5",
      secondary: "#475569",
      positive: "#16A34A",
      negative: "#DC2626",
      default: "#0F172A",
    };
    return colorMap[action || "primary"];
  };

  return (
    <View className={`mr-2 ${className}`}>
      <ActivityIndicator size="small" color={getSpinnerColor()} />
    </View>
  );
}

// ButtonGroup component
export interface ButtonGroupProps extends ViewProps {
  children: React.ReactNode;
  space?: "xs" | "sm" | "md" | "lg" | "xl";
  isAttached?: boolean;
  flexDirection?: "row" | "column";
  className?: string;
}

export function ButtonGroup({
  children,
  space = "md",
  isAttached = false,
  flexDirection = "row",
  className,
  ...props
}: ButtonGroupProps) {
  const spaceMap = {
    xs: "gap-1",
    sm: "gap-2",
    md: "gap-3",
    lg: "gap-4",
    xl: "gap-5",
  };

  const directionClass = flexDirection === "row" ? "flex-row" : "flex-col";
  const gapClass = isAttached ? "gap-0" : spaceMap[space];

  return (
    <View className={`${directionClass} ${gapClass} ${className}`} {...props}>
      {children}
    </View>
  );
}
