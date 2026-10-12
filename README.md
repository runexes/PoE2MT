# PoE 2 Map Tracker

Local browser tracker for Path of Exile 2 map runs.

The app reads `Client.txt`, detects area changes, groups runs by location, counts repeated runs, tracks map duration, and updates while the game keeps writing to the log.

## How to use

1. Open the tracker in Chrome.
2. Click `Open Client.txt`.
3. Select the game's `Client.txt` log file.
4. Wait for the full scan to finish.
5. Keep the page open while playing to update runs in realtime.

The tracker stores parsed data in your browser, so reopening the page does not require starting from scratch unless you click `Clear`.

## Log file location

The file is named:

```text
Client.txt
```

Common standalone install path:

```text
C:\Program Files\Grinding Gear Games\Path of Exile 2\logs\Client.txt
```

or, on some systems:

```text
C:\Program Files (x86)\Grinding Gear Games\Path of Exile 2\logs\Client.txt
```

Common Steam install path:

```text
C:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2\logs\Client.txt
```

If Steam is installed on another drive or library folder, open that Steam library and look for:

```text
steamapps\common\Path of Exile 2\logs\Client.txt
```

## Notes

- Works locally in Chrome.
- The app only reads the selected log file.
- Map completion time is calculated from entering an area until the next area transition.
- Location metadata is stored locally in `src/locations.js`.
