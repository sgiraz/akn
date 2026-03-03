import { Cell, ContributionGrid } from "./types";
import { COLS, ROWS } from "./grid";

export async function fetchContributions(
  username: string,
  token?: string
): Promise<ContributionGrid> {
  if (token) {
    return fetchViaGraphQL(username, token);
  }
  return fetchViaHTML(username);
}

async function fetchViaHTML(username: string): Promise<ContributionGrid> {
  const url = `https://github.com/users/${username}/contributions`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch contributions: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return parseContributionHTML(html);
}

function parseContributionHTML(html: string): ContributionGrid {
  // GitHub contribution calendar uses <td> with data-date and data-level
  const cellRegex = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g;

  const entries: { date: string; level: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(html)) !== null) {
    entries.push({ date: match[1], level: parseInt(match[2], 10) });
  }

  if (entries.length === 0) {
    throw new Error("No contribution data found in HTML");
  }

  // Sort by date
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // GitHub shows ~52 weeks (364 days). Group into weeks (cols) and weekdays (rows)
  // Each week is a column, each day of the week (Sun=0..Sat=6) is a row
  const firstDate = new Date(entries[0].date + "T00:00:00Z");
  const grid: ContributionGrid = [];

  for (let col = 0; col < COLS; col++) {
    grid[col] = [];
    for (let row = 0; row < ROWS; row++) {
      grid[col][row] = { col, row, level: 0 };
    }
  }

  for (const entry of entries) {
    const d = new Date(entry.date + "T00:00:00Z");
    const diffDays = Math.round((d.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const col = Math.floor(diffDays / 7);
    const row = d.getUTCDay(); // 0=Sun, 6=Sat
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      grid[col][row] = { col, row, level: entry.level };
    }
  }

  return grid;
}

async function fetchViaGraphQL(
  username: string,
  token: string
): Promise<ContributionGrid> {
  const query = `query($username: String!) {
    user(login: $username) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
              weekday
            }
          }
        }
      }
    }
  }`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status}`);
  }

  const json = await res.json() as any;
  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;

  const grid: ContributionGrid = [];
  for (let col = 0; col < COLS; col++) {
    grid[col] = [];
    for (let row = 0; row < ROWS; row++) {
      grid[col][row] = { col, row, level: 0 };
    }
  }

  // Take the last 52 weeks
  const recentWeeks = weeks.slice(-COLS);
  for (let col = 0; col < recentWeeks.length; col++) {
    const days = recentWeeks[col].contributionDays;
    for (const day of days) {
      const row = day.weekday;
      const level = countToLevel(day.contributionCount);
      if (col < COLS && row < ROWS) {
        grid[col][row] = { col, row, level };
      }
    }
  }

  return grid;
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}
