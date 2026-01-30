"use client";

import React from "react";
import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";

export interface SpinnerProps extends Omit<ActivityIndicatorProps, "size"> {
  size?: "small" | "large";
  className?: string;
}

export function Spinner({ size = "small", color, className, ...props }: SpinnerProps) {
  // Default to primary color if no color is specified
  const spinnerColor = color || "#4F46E5";

  return (
    <ActivityIndicator
      size={size}
      color={spinnerColor}
      className={className}
      {...props}
    />
  );
}
