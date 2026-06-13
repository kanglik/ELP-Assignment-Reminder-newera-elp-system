# ELP Assignment Reminder

ELP Assignment Reminder is a Chrome extension designed to help students manage assignment deadlines on the New Era ELP system. It scans assignment information, tracks completion status, shows remaining or overdue days, and provides reminder notifications before deadlines.

## Features

* Scan assignment deadlines from the ELP platform
* Display completed and incomplete assignments
* Show remaining days before the deadline
* Show overdue days for expired assignments
* Send Chrome notification reminders
* Provide a simple dashboard for viewing assignment status
* Help students manage coursework more efficiently

## Tech Stack

* HTML
* CSS
* JavaScript
* Chrome Extension Manifest V3

## Project Structure

```text
ELP-Assignment-Reminder/
├── background.js
├── content.js
├── dashboard.html
├── dashboard.js
├── icon.png
├── manifest.json
├── popup.html
└── popup.js
```

## File Description

| File             | Description                                         |
| ---------------- | --------------------------------------------------- |
| `manifest.json`  | Main configuration file for the Chrome extension    |
| `background.js`  | Handles background tasks, alarms, and notifications |
| `content.js`     | Scans assignment information from ELP pages         |
| `popup.html`     | Extension popup interface                           |
| `popup.js`       | Controls popup data display and user interaction    |
| `dashboard.html` | Dashboard page for viewing assignment status        |
| `dashboard.js`   | Handles dashboard logic and assignment display      |
| `icon.png`       | Extension icon                                      |

## How to Install

1. Download or clone this repository.
2. Open Google Chrome.
3. Go to:

```text
chrome://extensions/
```

4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select this extension project folder.
7. The extension should now appear in Chrome.

## How to Use

1. Open the New Era ELP system in Chrome.
2. Log in to your ELP account.
3. Open the assignment or course page.
4. Click the extension icon.
5. Use the popup or dashboard to check assignment status and deadlines.

## Purpose

This project was created to help students avoid missing assignment deadlines. Instead of manually checking every course page, the extension helps organize assignment information and gives a clearer view of upcoming or overdue tasks.

## Current Status

This project is still under development. Some features may require further testing and improvement depending on the ELP page structure.

## Future Improvements

* Auto-scan all courses
* Improve assignment status detection
* Add better dashboard design
* Support more deadline formats
* Add custom reminder settings
* Improve data storage and syncing

## Disclaimer

This project is created for educational and personal productivity purposes. It is not an official extension of New Era University College or the ELP system.
