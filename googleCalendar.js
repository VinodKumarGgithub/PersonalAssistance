import { google } from 'googleapis';

// Cached OAuth2 client instance
let cachedOAuth2Client = null;

/**
 * Creates or returns a cached OAuth2 client using credentials from environment variables.
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.
 */
function getOAuth2Client() {
  if (cachedOAuth2Client) return cachedOAuth2Client;

  cachedOAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/oauth/callback'
  );

  // If we already have a refresh token, set it
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    cachedOAuth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }

  return cachedOAuth2Client;
}

/**
 * Updates the cached OAuth2 client with a new refresh token at runtime.
 * Called after successful OAuth callback so the calendar works immediately
 * without a server restart.
 * @param {string} refreshToken
 */
function setRefreshToken(refreshToken) {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
}

/**
 * Returns the Google OAuth2 authorization URL for the Calendar scope.
 */
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

/**
 * Exchanges an authorization code for tokens.
 * @param {string} code - The authorization code from the OAuth callback.
 * @returns {Promise<object>} The tokens object containing access_token and refresh_token.
 */
async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Lists upcoming calendar events.
 * @param {object} options
 * @param {number} [options.maxResults=10] - Maximum number of events to return.
 * @param {number} [options.daysAhead=7] - Number of days ahead to look for events.
 * @returns {Promise<Array>} Array of event objects with summary, start, end, location, description.
 */
/**
 * Helper: get an authenticated Calendar client.
 */
function getCalendarClient() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Google Calendar not authenticated. Visit http://localhost:3000/auth/google to authenticate.'
    );
  }
  return google.calendar({ version: 'v3', auth: getOAuth2Client() });
}

/**
 * Lists upcoming calendar events.
 */
async function listEvents({ maxResults = 10, daysAhead = 7 } = {}) {
  const calendar = getCalendarClient();

  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  return events.map((event) => ({
    id: event.id,
    summary: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date || 'Unknown',
    end: event.end?.dateTime || event.end?.date || 'Unknown',
    location: event.location || null,
    description: event.description || null,
    htmlLink: event.htmlLink || null,
  }));
}

/**
 * Creates a new calendar event.
 * @param {object} options
 * @param {string} options.summary - Event title.
 * @param {string} options.startDateTime - ISO 8601 start time (e.g. "2025-07-26T10:00:00+05:30").
 * @param {string} options.endDateTime - ISO 8601 end time.
 * @param {string} [options.description] - Event description.
 * @param {string} [options.location] - Event location.
 * @param {string} [options.timeZone] - Time zone (default: Asia/Kolkata).
 */
async function createEvent({ summary, startDateTime, endDateTime, description, location, timeZone = 'Asia/Kolkata' }) {
  const calendar = getCalendarClient();

  const event = {
    summary,
    description: description || undefined,
    location: location || undefined,
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  return {
    id: response.data.id,
    summary: response.data.summary,
    start: response.data.start?.dateTime || response.data.start?.date,
    end: response.data.end?.dateTime || response.data.end?.date,
    htmlLink: response.data.htmlLink,
    status: 'created',
  };
}

/**
 * Updates an existing calendar event.
 * @param {object} options
 * @param {string} options.eventId - The event ID to update.
 * @param {string} [options.summary] - New title.
 * @param {string} [options.startDateTime] - New start time (ISO 8601).
 * @param {string} [options.endDateTime] - New end time (ISO 8601).
 * @param {string} [options.description] - New description.
 * @param {string} [options.location] - New location.
 * @param {string} [options.timeZone] - Time zone (default: Asia/Kolkata).
 */
async function updateEvent({ eventId, summary, startDateTime, endDateTime, description, location, timeZone = 'Asia/Kolkata' }) {
  const calendar = getCalendarClient();

  // First fetch the existing event
  const existing = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });

  const updatedEvent = {
    summary: summary || existing.data.summary,
    description: description !== undefined ? description : existing.data.description,
    location: location !== undefined ? location : existing.data.location,
    start: startDateTime
      ? { dateTime: startDateTime, timeZone }
      : existing.data.start,
    end: endDateTime
      ? { dateTime: endDateTime, timeZone }
      : existing.data.end,
  };

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId,
    requestBody: updatedEvent,
  });

  return {
    id: response.data.id,
    summary: response.data.summary,
    start: response.data.start?.dateTime || response.data.start?.date,
    end: response.data.end?.dateTime || response.data.end?.date,
    htmlLink: response.data.htmlLink,
    status: 'updated',
  };
}

/**
 * Deletes a calendar event.
 * @param {string} eventId - The event ID to delete.
 */
async function deleteEvent(eventId) {
  const calendar = getCalendarClient();

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });

  return { id: eventId, status: 'deleted' };
}

/**
 * Gets details of a specific calendar event.
 * @param {string} eventId - The event ID.
 */
async function getEvent(eventId) {
  const calendar = getCalendarClient();

  const response = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });

  const event = response.data;
  return {
    id: event.id,
    summary: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date || 'Unknown',
    end: event.end?.dateTime || event.end?.date || 'Unknown',
    location: event.location || null,
    description: event.description || null,
    htmlLink: event.htmlLink || null,
    attendees: event.attendees?.map(a => ({ email: a.email, status: a.responseStatus })) || [],
  };
}

export {
  getOAuth2Client, getAuthUrl, getTokensFromCode, setRefreshToken,
  listEvents, createEvent, updateEvent, deleteEvent, getEvent,
};
