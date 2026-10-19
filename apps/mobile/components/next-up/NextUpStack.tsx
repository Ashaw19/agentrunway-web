/**
 * The dashboard's Next up stack: the cards in a horizontal paging list, up
 * to two ghost cards peeking out behind (only while more cards wait), and
 * page dots under it. Each card carries "NEXT UP" and "1 OF N".
 *
 * Shown only with at least one card; the dashboard shows the all-clear card
 * otherwise.
 */

import { useEffect, useRef, useState } from "react";
import { FlatList, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import type { NextUpAction, NextUpCard as Card } from "@agent-runway/core/lib/next-up/build";
import { Space, shiftHex, useColors, useTheme } from "@/lib/theme";
import { CARD_HEIGHT, CARD_TONES, NextUpCard } from "./NextUpCard";

/** How far the back ghost card shows under the front card. */
const PEEK = 14;

export interface NextUpStackProps {
  cards: Card[];
  onAction: (action: NextUpAction, card: Card) => void;
  /** The key of the card whose tap is being handled, if any. */
  busyKey?: string | null;
}

export function NextUpStack({ cards, onAction, busyKey = null }: NextUpStackProps) {
  const c = useColors();
  const { mode } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth - Space.xl * 2);
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<Card>>(null);

  // A card that leaves (handled, put off) can leave the page past the end.
  const last = Math.max(0, cards.length - 1);
  useEffect(() => {
    if (page > last) {
      setPage(last);
      listRef.current?.scrollToOffset({ offset: last * width, animated: false });
    }
  }, [page, last, width]);

  if (cards.length === 0) return null;
  const current = cards[Math.min(page, last)];
  const tone = CARD_TONES[current.kind];
  const ghosts = Math.min(2, cards.length - 1);
  const ghostColor = (depth: 1 | 2) => mode === "dark"
    ? shiftHex(tone.gradient[1], depth === 1 ? -0.35 : -0.55)
    : shiftHex(tone.gradient[2], depth === 1 ? 0.62 : 0.78);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.max(0, Math.min(last, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (next !== page) {
      setPage(next);
      try { Haptics.selectionAsync(); } catch {}
    }
  };

  return (
    <View>
      <View
        style={{ height: CARD_HEIGHT + PEEK }}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== width) setWidth(w);
        }}
      >
        {ghosts >= 2 && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 24, right: 24, top: 20, height: CARD_HEIGHT - 6, borderRadius: 22, backgroundColor: ghostColor(2) }}
          />
        )}
        {ghosts >= 1 && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 12, right: 12, top: 12, height: CARD_HEIGHT - 6, borderRadius: 22, backgroundColor: ghostColor(1) }}
          />
        )}
        <FlatList
          ref={listRef}
          data={cards}
          keyExtractor={(card) => card.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          extraData={`${width}:${busyKey ?? ""}`}
          style={{ height: CARD_HEIGHT + PEEK }}
          renderItem={({ item, index }) => (
            <View style={{ width, height: CARD_HEIGHT }}>
              <NextUpCard card={item} index={index} total={cards.length} onAction={onAction} busy={item.key === busyKey} />
            </View>
          )}
        />
      </View>

      {cards.length > 1 && (
        <View
          style={{ flexDirection: "row", justifyContent: "center", gap: 5, marginTop: Space.sm }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {cards.map((card, i) => (
            <View
              key={card.key}
              style={{
                width: i === page ? 16 : 6, height: 6, borderRadius: 3,
                backgroundColor: i === page ? tone.gradient[2] : c.cardHighBorder,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
