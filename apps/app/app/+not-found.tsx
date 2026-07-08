import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/index" as any);
    }
  }, []);

  return null;
}
