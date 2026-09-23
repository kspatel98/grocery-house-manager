# V93.1 — DigitalOcean Agent compatibility fix

- Removed the request-level `system` message from the managed DigitalOcean Agent call.
- Agent instructions now live only in the DigitalOcean Agent configuration, as required by the managed Agent endpoint.
- Household context and the user's request are sent together as a normal `user` message.
- Private DigitalOcean Spaces is now displayed as an optional neutral status instead of a warning when disabled.
- Spaces is still not required for Kitchen Vision; ephemeral processing remains the recommended default.
