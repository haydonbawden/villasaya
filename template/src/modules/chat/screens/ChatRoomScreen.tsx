import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ChatRoomScreen() {
  return (
    <AppScreen subtitle="Threaded replies and media sharing" title="Chat room">
      <PlaceholderSection
        action={<AppButton>Reply</AppButton>}
        description="Supports attachments and voice notes"
        items={[{ subtitle: 'Welcome to the ops room', title: 'Ayu Tenant' }]}
        title="Messages"
      />
    </AppScreen>
  );
}

export default ChatRoomScreen;
