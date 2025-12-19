# VillaSaya - Developer Quick Start Guide

**For developers taking over this project**

---

## 🎯 What You're Looking At

This is a **high-quality React Native scaffold** with:
- ✅ 51 screens built and wired up
- ✅ Complete navigation structure
- ✅ TypeScript throughout
- ✅ Role-based permissions framework
- ❌ **BUT: No backend, no auth, no actual functionality**

**You're starting at ~40% completion. Expect 5-6 months to production.**

---

## 🚀 Day 1: Get It Running

### Step 1: Install Dependencies
```bash
cd template
yarn install
```

### Step 2: Install iOS Pods (Mac only)
```bash
cd ios
pod install
cd ..
```

### Step 3: Run the App
```bash
# iOS
yarn ios

# Android
yarn android
```

### Step 4: Verify Linting & Tests
```bash
yarn lint
yarn test
```

**Expected:** App should build, show placeholder screens, all tests pass.

---

## 📋 Day 2-3: Understand the Codebase

### Key Files to Read

1. **AGENTS.md** - Complete specification (17KB of requirements)
2. **README.md** - Project overview and structure
3. **template/src/App.tsx** - App entry point
4. **template/src/navigation/Application.tsx** - Navigation structure
5. **template/src/services/api/schemas.ts** - Data models
6. **template/src/services/api/mockApi.ts** - Mock API (replace this!)
7. **template/src/providers/RoleProvider.tsx** - RBAC implementation
8. **template/src/utils/** - Helper utilities (GPS, OCR, offline sync)

### Directory Structure
```
template/src/
  ├── modules/          # Feature modules (auth, tasks, staff, etc.)
  │   ├── auth/         # 5 auth screens
  │   ├── tasks/        # 7 task screens
  │   ├── staff/        # 8 staff screens
  │   ├── claims/       # 6 expense screens
  │   ├── chat/         # 5 chat screens
  │   ├── calendar/     # 5 calendar screens
  │   ├── contacts/     # 3 contact screens
  │   ├── documents/    # 4 document screens
  │   ├── notifications/# 4 incident screens
  │   ├── analytics/    # 3 analytics screens
  │   └── users/        # 2 user screens
  ├── components/
  │   ├── ui/           # Reusable UI components
  │   ├── forms/        # Form components
  │   └── ...
  ├── navigation/       # React Navigation setup
  ├── providers/        # Context providers (Role, Theme)
  ├── services/         # API layer (MOCK - replace with real)
  ├── utils/            # Utilities (permissions, GPS, OCR, offline)
  └── theme/            # Theme configuration
```

### What Each Screen Currently Does
**Answer: Not much.** They're placeholders using `PlaceholderSection` component.

Example (TaskListScreen.tsx):
```tsx
// Current: Just shows placeholder UI
<PlaceholderSection
  action={<AppButton>Create task</AppButton>}
  description="With SLA timers and overdue alerts"
  items={[
    { status: 'in_progress', subtitle: 'Due today 17:00', title: 'Prepare guest welcome' },
  ]}
  title="Open tasks"
/>

// Needed: Real task list from database
const { data: tasks } = useQuery(['tasks'], fetchTasks);
tasks.map(task => <TaskListItem task={task} />)
```

---

## 🗄️ Week 1: Set Up Backend

### Recommended: Supabase

**Why Supabase?**
- Postgres database (schema already defined in AGENTS.md)
- Built-in authentication
- Real-time subscriptions (for chat)
- File storage (for documents/receipts)
- Row Level Security (for permissions)
- Free tier for development

### Step-by-Step Supabase Setup

#### 1. Create Supabase Project
```bash
# Go to https://supabase.com
# Create new project
# Save these values:
# - Project URL
# - Anon Public Key
# - Service Role Key (for backend/admin operations)
```

#### 2. Set Up Database Schema
Copy the schema from AGENTS.md (sections starting at line ~700):

```sql
-- In Supabase SQL Editor, run these one by one:

-- 1. Profiles table
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  full_name text,
  photo_url text,
  role text check (role in ('tenant', 'staff', 'landlord', 'manager', 'contractor')),
  phone text,
  email text,
  default_villa_id uuid references villas(id),
  bank_details jsonb,
  employment_start date,
  employment_end date,
  position text,
  is_active boolean default true
);

-- 2. Villas table
create table villas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text,
  address text,
  tenant_id uuid references profiles(id),
  landlord_id uuid references profiles(id),
  manager_id uuid references profiles(id),
  photo_url text,
  timezone text default 'Asia/Makassar'
);

-- Continue with remaining tables from AGENTS.md...
-- (tasks, expense_claims, calendar_events, chat_rooms, messages, etc.)
```

#### 3. Set Up Row Level Security (RLS)
```sql
-- Example for tasks table
alter table tasks enable row level security;

-- Tenants can see all tasks for their villa
create policy "Tenants can view villa tasks"
  on tasks for select
  using (
    villa_id in (
      select id from villas where tenant_id = auth.uid()
    )
  );

-- Staff can see tasks assigned to them
create policy "Staff can view assigned tasks"
  on tasks for select
  using (
    id in (
      select task_id from task_assignees where staff_id = auth.uid()
    )
  );

-- Repeat for all tables with appropriate policies
```

#### 4. Configure Storage Buckets
```sql
-- Create storage buckets in Supabase Dashboard or SQL:

-- For receipt photos
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false);

-- For documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);

-- For staff photos
insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', false);

-- Set up storage policies (in Supabase Dashboard -> Storage)
```

#### 5. Create .env File
```bash
cd template
cp .env .env.local

# Edit .env.local with your Supabase credentials:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

#### 6. Install Supabase Client
```bash
yarn add @supabase/supabase-js
```

#### 7. Create Supabase Client Instance
Create `template/src/services/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import Config from 'react-native-config';

const supabaseUrl = Config.SUPABASE_URL || '';
const supabaseAnonKey = Config.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // Install @react-native-async-storage/async-storage
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## 🔐 Week 2: Implement Authentication

### Replace Mock Auth with Real Implementation

#### 1. Update LoginSignupScreen.tsx
```typescript
// template/src/modules/auth/screens/LoginSignupScreen.tsx

import { supabase } from '@/services/supabase';

function LoginSignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    setLoading(true);
    setError('');
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      setError(error.message);
    } else {
      // Navigate to role selection
      navigation.navigate('RoleSelection');
    }
    
    setLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      setError(error.message);
    } else {
      // Navigate to dashboard
      navigation.navigate('AppTabs');
    }
    
    setLoading(false);
  };

  return (
    <AppScreen title="Sign In">
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />
      {error ? <Text style={{color: 'red'}}>{error}</Text> : null}
      <AppButton onPress={handleLogin} loading={loading}>
        Sign In
      </AppButton>
      <AppButton onPress={handleSignup} loading={loading} variant="secondary">
        Sign Up
      </AppButton>
    </AppScreen>
  );
}
```

#### 2. Add Auth State Management
Create `template/src/providers/AuthProvider.tsx`:
```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import type { User } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

#### 3. Update App.tsx
```typescript
import { AuthProvider } from '@/providers/AuthProvider';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RoleProvider>
            <ThemeProvider storage={storage}>
              <ApplicationNavigator />
            </ThemeProvider>
          </RoleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

---

## 📝 Week 3-4: Implement First Feature (Tasks)

### Replace Mock Task API with Real Implementation

#### 1. Create Task API Service
`template/src/services/api/tasks.ts`:
```typescript
import { supabase } from '@/services/supabase';
import type { Task } from './schemas';

export async function fetchTasks(villaId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('villa_id', villaId)
    .order('due_date', { ascending: true });

  if (error) throw error;
  return data as Task[];
}

export async function createTask(task: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert([task])
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
```

#### 2. Update TaskListScreen with Real Data
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '@/services/api/tasks';
import { useRole } from '@/providers/RoleProvider';

function TaskListScreen() {
  const { user } = useAuth();
  const villaId = user?.user_metadata?.default_villa_id;

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['tasks', villaId],
    queryFn: () => fetchTasks(villaId),
    enabled: !!villaId,
  });

  if (isLoading) {
    return <AppScreen title="Tasks"><Skeleton /></AppScreen>;
  }

  if (error) {
    return <AppScreen title="Tasks"><ErrorMessage error={error} /></AppScreen>;
  }

  return (
    <AppScreen title="Tasks">
      <FlatList
        data={tasks}
        renderItem={({ item }) => (
          <TaskListItem
            task={item}
            onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
          />
        )}
        keyExtractor={(item) => item.id}
      />
      <FloatingActionButton
        onPress={() => navigation.navigate('TaskCreate')}
        icon="plus"
      />
    </AppScreen>
  );
}
```

#### 3. Build TaskListItem Component
Create `template/src/components/ui/TaskListItem.tsx`:
```typescript
export function TaskListItem({ task, onPress }) {
  return (
    <AppListItem
      title={task.title}
      subtitle={task.description}
      meta={<StatusBadge tone={getStatusTone(task.status)}>{task.status}</StatusBadge>}
      onPress={onPress}
    />
  );
}
```

---

## 🧪 Continuous: Add Tests as You Build

For each feature you implement, add tests:

```typescript
// template/src/modules/tasks/__tests__/TaskList.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskListScreen from '../screens/TaskListScreen';

const queryClient = new QueryClient();

describe('TaskListScreen', () => {
  it('displays tasks when loaded', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TaskListScreen />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Garden trim')).toBeTruthy();
    });
  });
});
```

---

## 📚 Feature Implementation Priority

Build features in this order for fastest path to MVP:

### Month 1: Foundation
- [x] Backend setup (Supabase)
- [x] Authentication
- [ ] Task CRUD operations
- [ ] Staff profile management

### Month 2: Core Operations
- [ ] GPS attendance check-in
- [ ] Leave request workflow
- [ ] Expense claim submission
- [ ] Basic chat (real-time)

### Month 3: Advanced Features
- [ ] OCR for receipts
- [ ] Calendar & roster
- [ ] Document management
- [ ] Task notifications

### Month 4: Polish
- [ ] Testing (70% coverage)
- [ ] Performance optimization
- [ ] Offline sync
- [ ] Error handling

### Month 5: Production Prep
- [ ] Security audit
- [ ] CI/CD setup
- [ ] Beta testing
- [ ] Analytics & monitoring

### Month 6: Launch
- [ ] Final QA
- [ ] App store submission
- [ ] Production deployment

---

## 🔧 Common Patterns You'll Use

### Pattern 1: CRUD Operations
```typescript
// List
const { data, isLoading } = useQuery(['items'], fetchItems);

// Create
const createMutation = useMutation(createItem, {
  onSuccess: () => queryClient.invalidateQueries(['items']),
});

// Update
const updateMutation = useMutation(
  ({ id, updates }) => updateItem(id, updates),
  { onSuccess: () => queryClient.invalidateQueries(['items']) }
);

// Delete
const deleteMutation = useMutation(deleteItem, {
  onSuccess: () => queryClient.invalidateQueries(['items']),
});
```

### Pattern 2: Real-time Subscriptions (Chat)
```typescript
useEffect(() => {
  const channel = supabase
    .channel('messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [roomId]);
```

### Pattern 3: File Upload
```typescript
async function uploadReceipt(uri: string, claimId: string) {
  const ext = uri.split('.').pop();
  const fileName = `${claimId}.${ext}`;
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: `image/${ext}`,
  });

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(fileName, formData);

  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('receipts')
    .getPublicUrl(fileName);

  return publicUrl;
}
```

---

## 🚨 Common Pitfalls to Avoid

1. **Don't commit .env files** - Add to .gitignore
2. **Don't expose service key in app** - Use anon key only
3. **Always validate user input** - Never trust client data
4. **Use RLS policies** - Don't rely on client-side permission checks
5. **Handle loading states** - Users hate blank screens
6. **Handle errors gracefully** - Show user-friendly messages
7. **Test on real devices** - Simulators hide real-world issues
8. **Keep bundle size small** - Remove unused dependencies

---

## 📖 Recommended Reading

### Official Docs
- [Supabase Documentation](https://supabase.com/docs)
- [React Navigation](https://reactnavigation.org/)
- [React Query (TanStack Query)](https://tanstack.com/query/latest)
- [React Native](https://reactnative.dev/)

### Specific Features
- **OCR:** Google ML Kit Vision Text Recognition
- **GPS:** react-native-geolocation-service
- **Camera:** react-native-vision-camera
- **Charts:** react-native-chart-kit or Victory Native
- **PDF:** react-native-pdf or react-native-pdf-lib

---

## 🆘 Getting Help

### When Stuck:
1. Check existing code in similar modules
2. Review AGENTS.md spec
3. Check this guide
4. Search official docs
5. Ask AI coding assistant
6. Stack Overflow / GitHub Issues

### Good Luck! 🚀

**Remember:** The hard architectural decisions are done. You have a solid foundation. Now it's just execution - one feature at a time, with tests.

**You got this!** 💪

