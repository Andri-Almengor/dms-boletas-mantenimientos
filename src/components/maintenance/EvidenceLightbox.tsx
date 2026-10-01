import { colors, spacing } from '@/theme/tokens';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  title?: string;
  onClose: () => void;
};

function VideoContent({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      contentFit="contain"
      allowsFullscreen
    />
  );
}

export function EvidenceLightbox({
  uri,
  mediaType,
  title = 'Evidencia',
  onClose,
}: Props) {
  return (
    <Modal
      visible={Boolean(uri)}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          {uri && mediaType === 'video' ? (
            <VideoContent uri={uri} />
          ) : uri ? (
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : null}
        </View>

        <Text style={styles.hint}>
          {mediaType === 'video'
            ? 'Use los controles del reproductor para ampliar o reproducir.'
            : 'La imagen se muestra conservando su proporción.'}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  close: {
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  closeText: {
    color: colors.primary,
    fontWeight: '900',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  hint: {
    color: '#d0d4db',
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
