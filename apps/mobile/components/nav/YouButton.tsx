/**
 * Your initials at the top of Today: opens You (settings), as the App Store
 * and Music open your account from your picture at the top.
 */
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/lib/useT";
import { NAV } from "@/lib/app-nav";

export function YouButton({ name }: { name: string }) {
  const router = useRouter();
  const { t } = useT("profile");
  return (
    <Pressable
      onPress={() => router.push(NAV.you)}
      accessibilityRole="button"
      accessibilityLabel={t("you.open")}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Avatar name={name} size="sm" />
    </Pressable>
  );
}
