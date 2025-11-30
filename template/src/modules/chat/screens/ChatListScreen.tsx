import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ChatListScreen() {
  return (
    <AppScreen subtitle="Direct and group messaging" title="Chats">
      <PlaceholderSection
        action={<AppButton>Create group</AppButton>}
        description="Typing indicators, read receipts, and @mentions"
        items={[
          { subtitle: 'Group • 4 participants', title: 'Villa Saya HQ' },
          { subtitle: 'Direct message', title: 'Kadek' },
        ]}
        title="Channels"
      />
    </AppScreen>
  );
}

export default ChatListScreen;
