# Mobile App Guide

## Navigation Structure

The app uses Expo Router (file-based routing) in `apps/app/app/`:

```
app/
  _layout.tsx              # Root: SafeAreaProvider → GestureHandler → ThemeModeProvider → GluestackUI → AuthProvider
  (auth)/
    _layout.tsx            # Auth layout (unauthenticated)
    sign-in.tsx            # Google OAuth sign-in
  (onboarding)/
    _layout.tsx            # Onboarding layout
    welcome.tsx            # Welcome/import screen
  (tabs)/
    _layout.tsx            # Tab bar (6 tabs)
    assistant.tsx          # AI assistant chat (default tab)
    index.tsx              # Contacts list
    conversations.tsx      # Conversations list
    events.tsx             # Events list
    reminders.tsx          # Reminders list
    settings.tsx           # Settings
  contact/
    new.tsx                # Create contact
    [id].tsx               # Contact detail
    [id]/edit.tsx          # Edit contact
  conversation/
    [id].tsx               # Conversation detail
    [id]/edit.tsx          # Edit conversation
  event/
    [id].tsx               # Event detail
    [id]/edit.tsx          # Edit event
  reminder/
    new.tsx                # Create reminder
    [id].tsx               # Reminder detail
    [id]/edit.tsx          # Edit reminder
  google-import.tsx        # Google Contacts import flow
  incoming-call.tsx        # Incoming call screen
  auth/callback.tsx        # OAuth callback deep link handler
```

### Auth-Gated Navigation

The root `_layout.tsx` handles all auth redirects:
- Unauthenticated → `/(auth)/sign-in`
- Authenticated + onboarding incomplete → `/welcome`
- Authenticated + onboarding complete + in auth/onboarding routes → `/(tabs)/assistant`

The assistant tab is the default/home tab (`initialRouteName="assistant"` in tabs layout).

## Styling

- **NativeWind** (Tailwind CSS for React Native) - `className` props on RN components
- **Tailwind config**: `apps/app/tailwind.config.js`
- **Global CSS**: `apps/app/global.css`
- **Gluestack UI**: Component library with theme-aware primitives in `apps/app/components/ui/`
  - `box`, `card`, `input`, `heading`, `spinner`, `hstack`, `button`, `divider`, `text`, `vstack`
- **Icons**: `lucide-react-native`
- **Theme colors**: Access via `useThemeColors()` and `getThemeColor(colors, tokenName)`

## Key Libraries

| Library | Purpose |
|---------|---------|
| `expo-router` | File-based navigation |
| `nativewind` | Tailwind CSS for React Native |
| `@supabase/supabase-js` | Auth + Supabase client |
| `expo-image-picker` | Camera/gallery image selection |
| `expo-audio` | Voice recording for assistant |
| `expo-web-browser` | OAuth redirect flow |
| `expo-auth-session` | OAuth redirect URL generation |
| `react-native-gesture-handler` | Swipe/gesture interactions |
| `@legendapp/motion` | Animations |
| `date-fns` | Date formatting |
| `tailwind-variants` | Variant-based styling |

## API Communication Pattern

All API calls go through `apps/app/lib/api.ts`:

```typescript
import { contactsApi } from '../lib/api';

// List with pagination
const { contacts, nextCursor } = await contactsApi.list({ search: 'John', limit: 20 });

// CRUD
const contact = await contactsApi.create({ displayName: 'John' });
await contactsApi.update(contact.id, { company: 'Acme' });
await contactsApi.delete(contact.id);
```

The `ApiClient` automatically attaches the Supabase auth token from the current session. On web, when `EXPO_PUBLIC_API_URL` is empty, requests use relative URLs (same origin as the Hono server).
