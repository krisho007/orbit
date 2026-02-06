# Orbit API Reference

## Base URL
- API routes are mounted under `/api`.
- Health route is `/health`.

## Auth
- All `/api/*` routes require `Authorization: Bearer <token>` unless noted.

## Health
- `GET /health` -> `{ status: "ok" }`
- `GET /api` -> basic API info and timestamp

## Contacts
- `GET /api/contacts`
  - Query: `cursor`, `limit`, `search`
- `GET /api/contacts/:id`
- `POST /api/contacts`
  - Body: `displayName`, `primaryPhone?`, `primaryEmail?`, `dateOfBirth?`, `gender?`, `company?`, `jobTitle?`, `location?`, `notes?`, `tagIds?[]`
- `PUT /api/contacts/:id`
  - Body: any of the create fields
- `DELETE /api/contacts/:id`

- `POST /api/contacts/:id/images`
  - Body: `imageUrl`, `publicId?`
- `POST /api/contacts/:id/images/upload`
  - Body: `base64Data`, `contentType`, `fileName?`
- `DELETE /api/contacts/:id/images/:imageId`

- `GET /api/contacts/search/fuzzy`
  - Query: `name`, `limit`
- `GET /api/contacts/search/phone`
  - Query: `phone`, `include=conversations,events,reminders?`, `conversationsLimit?`, `eventsLimit?`, `remindersLimit?`
  - Returns: `{ contact, candidates, conversations?, events?, reminders? }`
- `POST /api/contacts/google/fetch`
  - Body: `accessToken`, `includePhotos?`
  - Returns: `{ contacts: GoogleContact[] }` where each contact may include `photoBase64` and `photoContentType`
- `POST /api/contacts/google/import/batch`
  - Body: `contacts[]`, `overrideExisting?`
  - Duplicate matching order:
    - normalized `primaryPhone` (digits only)
    - if incoming has no phone: exact `primaryEmail`
    - if incoming has no phone: strict normalized name match (case/spacing/punctuation-insensitive) against contacts that also have no phone
  - Name merge rule: if incoming `displayName` is more detailed (longer normalized value), it overwrites the existing name
  - Returns: `{ imported, updated, skipped, errors }`

- `GET /api/contacts/:id/conversations`
  - Query: `cursor`, `limit`, `search`, `medium`
- `GET /api/contacts/:id/events`
  - Query: `cursor`, `limit`, `search`, `eventType`

## Conversations
- `GET /api/conversations`
  - Query: `cursor`, `limit`, `search`, `medium`
- `GET /api/conversations/:id`
- `POST /api/conversations`
  - Body: `content?`, `medium`, `happenedAt`, `followUpAt?`, `eventId?`, `participantIds[]`
- `PUT /api/conversations/:id`
  - Body: any of the create fields
- `DELETE /api/conversations/:id`

- `GET /api/conversations/by-contacts`
  - Query: `contactIds` (comma-separated, AND semantics), `cursor`, `limit`, `search`, `medium`

## Events
- `GET /api/events`
  - Query: `cursor`, `limit`, `search`, `eventType`
- `GET /api/events/:id`
- `POST /api/events`
  - Body: `title`, `description?`, `eventType`, `startAt`, `endAt?`, `location?`, `participantIds?[]`
- `PUT /api/events/:id`
  - Body: any of the create fields
- `DELETE /api/events/:id`

- `GET /api/events/:id/conversations`
  - Query: `cursor`, `limit`, `search`, `medium`
- `GET /api/events/:id/contacts`

## Reminders
- `GET /api/reminders`
  - Query: `cursor`, `limit`, `search`, `status`, `dueBefore`, `dueAfter`, `contactId`
- `GET /api/reminders/:id`
- `POST /api/reminders`
  - Body: `title?`, `notes?`, `dueAt`, `status?`, `recurrence?`, `recurrenceInterval?`, `recurrenceEndsAt?`, `conversationId?`, `participantIds?[]`
  - `participantIds` is optional (unlinked reminders are allowed)
  - `recurrence` values: `NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` (default: `NONE`)
- `PUT /api/reminders/:id`
  - Body: any of the create fields
- `DELETE /api/reminders/:id`

## Tags
- `GET /api/tags`
- `GET /api/tags/:id`
- `POST /api/tags`
  - Body: `name`, `color?`
- `PUT /api/tags/:id`
  - Body: `name?`, `color?`
- `DELETE /api/tags/:id`

## Relationships
- `GET /api/relationships`
  - Query: `contactId?`
- `POST /api/relationships`
  - Body: `fromContactId`, `toContactId`, `typeId`, `notes?`
- `PUT /api/relationships/:id`
  - Body: `typeId?`, `notes?`
- `DELETE /api/relationships/:id`

- `GET /api/relationships/types`
- `POST /api/relationships/types`
  - Body: `name`, `reverseTypeId?`, `maleReverseTypeId?`, `femaleReverseTypeId?`, `isSymmetric?`
- `PUT /api/relationships/types/:id`
  - Body: any of the create fields
- `DELETE /api/relationships/types/:id`

## Assistant
- `POST /api/assistant`
  - Body: `{ messages: [{ role: "user"|"assistant", content: string }] }`

## Enums
- Conversation medium: `PHONE_CALL`, `WHATSAPP`, `EMAIL`, `CHANCE_ENCOUNTER`, `ONLINE_MEETING`, `IN_PERSON_MEETING`, `OTHER`
- Event type: `MEETING`, `CALL`, `BIRTHDAY`, `ANNIVERSARY`, `CONFERENCE`, `SOCIAL`, `FAMILY_EVENT`, `OTHER`
- Reminder status: `OPEN`, `DONE`, `CANCELED`
- Reminder recurrence: `NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`
- Gender: `MALE`, `FEMALE`
