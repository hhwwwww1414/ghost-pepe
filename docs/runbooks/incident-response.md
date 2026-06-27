# Incident response (docs 02 §10, 05 §17)

## Node offline (no heartbeat > 2 min)
1. Admin → Серверы shows 🔴. Check `node-agent` service: `systemctl status node-agent`.
2. Control-plane unreachable < 10 min → node-agent keeps last known-good state.
   Already-disabled users stay disabled (never re-enabled from cache).
3. Losing one exit does NOT break bot/admin/db (control-plane is on FI only).

## Xray / Hysteria down
- node-agent reports `xray_alive=false` / `hysteria_alive=false` → health event.
- Fix config, `systemctl restart xray` / `hysteria-server`.

## Payment errors
- Check `payment_events` (event_type=error) and bot logs.
- Stars are credited only on `successful_payment`; duplicates are idempotent.

## Traffic stats stalled (> 10 min)
- Check node-agent stats loop + Hysteria Traffic Stats API reachability on localhost.

## Mass DEVICE_LIMIT_REACHED / auth-failed
- Possible token leak. Revoke the user's devices in Admin, rotate subscription token.
