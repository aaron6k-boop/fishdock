// ---- RemindButton: put a fishing window in the phone's calendar, with a reminder an hour before ----
import { useApp } from "../lib/store.js";
import { icsEvent } from "../lib/ics.js";
import { exportFile } from "../lib/files.js";
import { fmtTime } from "../lib/time.js";
import { Icon } from "./ui.jsx";

/** win: { start, end, peak }. where: the place's name (pins too: a name, never a position). */
export default function RemindButton({ win, where, species, small = true }) {
  const { say } = useApp();
  if (!win || win.end <= Date.now()) return null;
  async function add() {
    const title = `Fishing${species ? ` for ${species.toLowerCase()}` : ""}${where ? ` at ${where}` : ""}`;
    const notes = `FishDock best window ${fmtTime(win.start)} to ${fmtTime(win.end)}${win.peak ? `, BiteScore ${win.peak}` : ""}. A guide, not a promise: check the weather, tides and access before you go.`;
    const r = await exportFile(`fishdock-${new Date(win.start).toISOString().slice(0, 10)}.ics`, icsEvent({ title, start: win.start, end: win.end, where, notes }), "text/calendar");
    say(r.ok ? "Calendar file ready: open it to add the event" : r.message);
  }
  return <button type="button" className={`btn ${small ? "small" : ""}`} onClick={add}><Icon name="bell" />Remind me</button>;
}
