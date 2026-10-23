import { z } from "zod";

const number = z.number().finite();
export const widgetStatusSchema = z.enum(["ok", "stale", "error", "disabled", "unconfigured"]);
const meta = { status: widgetStatusSchema, fetchedAt: z.string().nullable(), error: z.string().optional() };
const weatherCurrentSchema = z.object({
  temp: number, apparent: number, code: number, desc: z.string(), icon: z.string(),
  windSpeed: number, humidity: number, isDay: z.boolean(),
});
const weatherHourSchema = z.object({ time: z.string(), temp: number, code: number, pop: number });
const weatherDaySchema = z.object({ date: z.string(), min: number, max: number, code: number, pop: number });
const weatherSchema = z.object({ ...meta, current: weatherCurrentSchema.nullable(), hourly: z.array(weatherHourSchema), daily: z.array(weatherDaySchema) });
const spotifyTrackSchema = z.object({
  title: z.string(), artists: z.string(), album: z.string(), artUrl: z.string().optional(),
  durationMs: number, progressMs: number,
});
const spotifySchema = z.object({ ...meta, isPlaying: z.boolean(), track: spotifyTrackSchema.nullable(), device: z.string().optional() });
const busArrivalSchema = z.object({
  route: z.string(), dest: z.string(), etaMin: number.nullable(), scheduled: z.string().optional(), status: z.string().optional(),
});
const busStopSchema = z.object({ label: z.string(), arrivals: z.array(busArrivalSchema) });
const busSchema = z.object({ ...meta, stops: z.array(busStopSchema) });
const trainLineSchema = z.object({ name: z.string(), status: z.string(), detail: z.string().optional(), normal: z.boolean() });
const trainsSchema = z.object({ ...meta, shinkansen: z.object({ summary: z.string(), lines: z.array(trainLineSchema) }).nullable(), lines: z.array(trainLineSchema) });
const calendarEventSchema = z.object({
  title: z.string(), start: z.string(), end: z.string(), allDay: z.boolean(),
  location: z.string().optional(), calendar: z.string().optional(), color: z.string().optional(),
});
const calendarSchema = z.object({ ...meta, events: z.array(calendarEventSchema) });

/** Shared wire contract for /api/state and every SSE data event. */
export const signageStateSchema = z.object({
  updatedAt: z.string(), location: z.object({ name: z.string() }), weather: weatherSchema,
  spotify: spotifySchema, bus: busSchema, trains: trainsSchema, calendar: calendarSchema,
});
export type WidgetStatus = z.infer<typeof widgetStatusSchema>;
export type WidgetMeta = Pick<z.infer<typeof weatherSchema>, "status" | "fetchedAt" | "error">;
export type WeatherCurrent = z.infer<typeof weatherCurrentSchema>;
export type WeatherHour = z.infer<typeof weatherHourSchema>;
export type WeatherDay = z.infer<typeof weatherDaySchema>;
export type WeatherState = z.infer<typeof weatherSchema>;
export type SpotifyTrack = z.infer<typeof spotifyTrackSchema>;
export type SpotifyState = z.infer<typeof spotifySchema>;
export type BusArrival = z.infer<typeof busArrivalSchema>;
export type BusStop = z.infer<typeof busStopSchema>;
export type BusState = z.infer<typeof busSchema>;
export type TrainLine = z.infer<typeof trainLineSchema>;
export type TrainsState = z.infer<typeof trainsSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarState = z.infer<typeof calendarSchema>;
export type SignageState = z.infer<typeof signageStateSchema>;

export function emptyMeta(status: WidgetStatus): WidgetMeta {
  return { status, fetchedAt: null };
}
