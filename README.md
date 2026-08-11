# E-RYDEZ Operations Console

An internal operations-console prototype for coordinating mock orders, conversations, fulfillment,
inventory, returns, appointments, purchasing, and automation approvals.

The supported host deployment uses Docker Compose to run the production React bundle behind Nginx,
one FastAPI worker, and authenticated MongoDB. It is unauthenticated plain HTTP intended only for a
trusted LAN or VPN.

See [`PROJECT.md`](PROJECT.md) for the system summary and
[`docs/runbooks/README.md`](docs/runbooks/README.md) for deployment and operating procedures.
