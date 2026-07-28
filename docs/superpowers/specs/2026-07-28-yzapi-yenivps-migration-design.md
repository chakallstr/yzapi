# YZAPI Yenivps Migration Design

## Goal

Move the standalone YZAPI runtime, its PostgreSQL data, and its public API endpoint from `yzapi-vps` to `yenivps`, publish it only at `https://yzapi.seslab.tr/v1`, and remove the old `api.yapayzekalab.org` connection after the new endpoint is proven healthy.

## Boundaries

- Scope is `/Users/ufuk/yzapi` and the live `/opt/turkapiprojesi` service only.
- `gpt-web`, its files, services, ports, tunnel, and provider implementation are out of scope.
- The existing `yapayzekalab.org` website is not migrated by this operation.
- No secret value is printed, committed, or copied into the repository.

## Architecture

`yenivps` becomes the sole YZAPI application and database host. Nginx terminates TLS for `yzapi.seslab.tr` and proxies canonical `/v1/*`, `/health`, and `/status` traffic to the local YZAPI service on `127.0.0.1:4568`. The target database is replaced by a consistent source snapshot, while the target environment keeps its local database connection and receives only the source cryptographic/runtime values required to decrypt the migrated records.

## Migration Sequence

1. Capture source and target application, database, environment, service, and Nginx backups.
2. Compare environment key names and critical secret compatibility without exposing values.
3. Put the source YZAPI service into a short write freeze, produce a PostgreSQL custom-format dump, and transfer it directly to `yenivps`.
4. Restore the dump into the target database, deploy commit `8f3ff67`, install dependencies, run migrations, lint, tests, build, and public-secret scan.
5. Start the target service and prove `127.0.0.1:4568/health` and `/status`.
6. Create the `yzapi.seslab.tr` Nginx vhost, add DNS to `153.56.184.202`, obtain TLS, and verify the external endpoint.
7. Run authenticated `/v1/responses` checks for `exec`, `wait`, `apply_patch`, namespace tool dispatch, and streaming tool dispatch. Correlate every request ID with YZAPI telemetry.
8. Remove the old `api.yapayzekalab.org` DNS/vhost connection and disable the source `turkapiprojesi` service only after the new endpoint passes all gates.

## Rollback

- Target application, database, environment, and Nginx are backed up before replacement.
- Source remains intact and restartable until the external tool suite passes.
- Before old DNS is removed, rollback means restoring the previous DNS record and source Nginx/service state.
- After old DNS removal, rollback remains possible from the retained source and target backups; no backup contains plaintext API keys outside their existing encrypted database/environment formats.

## Acceptance Criteria

- `yzapi.seslab.tr` resolves only to `153.56.184.202` and presents a valid certificate.
- Target `turkapiprojesi` is active; `/health` and `/status` return HTTP 200.
- Source and target migration counts match for users, API keys, and core billing/usage tables at cutover.
- The public Responses endpoint returns exact tool names `exec`, `wait`, and `apply_patch`; namespace and stream cases also return tool calls without doubled aliases.
- Logs show `toolSource=additional_tools`, positive `toolCount`, positive `toolCallCount`, no dropped tool types, and no suspicious-success warning for proof requests.
- Temporary proof credentials are revoked and their user is disabled with zero balances.
- `api.yapayzekalab.org` no longer resolves/routes to YZAPI, and source `turkapiprojesi` is disabled.

