import {
  SignatureDraft,
  SignaturePoint,
  SignatureStroke,
} from '@/features/maintenance/maintenanceSignature';
import { colors, radius, sizing, spacing } from '@/theme/tokens';
import * as ImagePicker from 'expo-image-picker';
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  value: SignatureDraft | null;
  onChange: (value: SignatureDraft | null) => void;
  disabled?: boolean;
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function Line({
  from,
  to,
  width,
  height,
}: {
  from: SignaturePoint;
  to: SignaturePoint;
  width: number;
  height: number;
}) {
  const x1 = from.x * width;
  const y1 = from.y * height;
  const x2 = to.x * width;
  const y2 = to.y * height;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(3, Math.sqrt((dx * dx) + (dy * dy)));
  const angle = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.line,
        {
          width: length,
          left: ((x1 + x2) / 2) - (length / 2),
          top: ((y1 + y2) / 2) - 1.5,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
    />
  );
}

function Stroke({
  stroke,
  width,
  height,
}: {
  stroke: SignatureStroke;
  width: number;
  height: number;
}) {
  if (!stroke.length) return null;
  if (stroke.length === 1) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.dot,
          {
            left: (stroke[0].x * width) - 2,
            top: (stroke[0].y * height) - 2,
          },
        ]}
      />
    );
  }
  return (
    <>
      {stroke.slice(1).map((point, index) => (
        <Line
          key={`${index}-${point.x}-${point.y}`}
          from={stroke[index]}
          to={point}
          width={width}
          height={height}
        />
      ))}
    </>
  );
}

export function SignaturePad({
  value,
  onChange,
  disabled = false,
}: Props) {
  const [canvas, setCanvas] = useState({ width: 1, height: 1 });
  const strokesRef = useRef<SignatureStroke[]>([]);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (drawingRef.current) return;
    strokesRef.current = value?.kind === 'drawing'
      ? value.strokes
      : [];
  }, [value]);

  const pointFromEvent = (event: {
    nativeEvent: { locationX: number; locationY: number };
  }) => ({
    x: clamp(event.nativeEvent.locationX / Math.max(1, canvas.width)),
    y: clamp(event.nativeEvent.locationY / Math.max(1, canvas.height)),
  });

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (event) => {
        if (disabled) return;
        drawingRef.current = true;
        const base = value?.kind === 'drawing'
          ? strokesRef.current
          : [];
        const next = [...base, [pointFromEvent(event)]];
        strokesRef.current = next;
        onChange({ kind: 'drawing', strokes: next });
      },
      onPanResponderMove: (event) => {
        if (disabled || !drawingRef.current) return;
        const current = strokesRef.current;
        if (!current.length) return;
        const next = current.map((stroke, index) => (
          index === current.length - 1
            ? [...stroke, pointFromEvent(event)]
            : stroke
        ));
        strokesRef.current = next;
        onChange({ kind: 'drawing', strokes: next });
      },
      onPanResponderRelease: () => {
        drawingRef.current = false;
      },
      onPanResponderTerminate: () => {
        drawingRef.current = false;
      },
      onShouldBlockNativeResponder: () => true,
    }),
    [canvas.height, canvas.width, disabled, onChange, value?.kind],
  );

  async function chooseImage() {
    if (disabled || drawingRef.current) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    onChange({
      kind: 'image',
      uri: asset.uri,
      mimeType: String(asset.mimeType || ''),
      fileName: String(asset.fileName || 'firma.jpg'),
      fileSize: Number(asset.fileSize || 0),
    });
  }

  function clear() {
    if (disabled || drawingRef.current) return;
    strokesRef.current = [];
    onChange(null);
  }

  const strokes = value?.kind === 'drawing' ? value.strokes : [];

  return (
    <View style={styles.wrapper}>
      <View
        {...panResponder.panHandlers}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCanvas({
            width: Math.max(1, width),
            height: Math.max(1, height),
          });
        }}
        style={[
          styles.canvas,
          disabled && styles.disabled,
        ]}
      >
        {value?.kind === 'image' ? (
          <Image
            source={{ uri: value.uri }}
            resizeMode="contain"
            style={styles.image}
          />
        ) : null}
        {strokes.map((stroke, index) => (
          <Stroke
            key={`stroke-${index}`}
            stroke={stroke}
            width={canvas.width}
            height={canvas.height}
          />
        ))}
        {!value ? (
          <Text pointerEvents="none" style={styles.placeholder}>
            Firme aquí con el dedo, mouse o stylus
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          disabled={disabled}
          onPress={chooseImage}
          style={({ pressed }) => [
            styles.button,
            pressed && !disabled && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>Cargar imagen</Text>
        </Pressable>
        <Pressable
          disabled={disabled || !value}
          onPress={clear}
          style={({ pressed }) => [
            styles.button,
            pressed && !disabled && styles.pressed,
            (disabled || !value) && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>Limpiar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  canvas: {
    height: 190,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: '#fff',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    color: '#7a8494',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  line: {
    position: 'absolute',
    height: 3,
    borderRadius: 999,
    backgroundColor: '#18202b',
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#18202b',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  button: {
    flex: 1,
    minHeight: sizing.buttonHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 12,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
