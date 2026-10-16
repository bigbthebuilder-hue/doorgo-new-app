// Pure argument validation: importing this module never opens a connection.
import path from 'node:path';

export function passwordTestConnection(argv, environment = process.env) {
  const options = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--host', '--port', '--database', '--user', '--psql', '--passfile'].includes(key)
      || options.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Supply each explicit local connection option exactly once; credentials are not arguments.');
    }
    options.set(key, argv[i + 1]);
  }
  if (options.size !== 6) throw new Error('Required: --host --port --database --user --psql --passfile');
  const host = options.get('--host');
  const port = options.get('--port');
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Literal loopback host required');
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535 || Number(port) === 5432) {
    throw new Error('Explicit nondefault local port required (1024–65535, excluding 5432)');
  }
  if (options.get('--database') !== 'doorgo_password_test' || options.get('--user') !== 'postgres') {
    throw new Error('Requires disposable doorgo_password_test database and isolated postgres owner');
  }
  const executable = options.get('--psql');
  const passfile = options.get('--passfile');
  if (!path.isAbsolute(executable) || !/^psql(?:\.exe)?$/i.test(path.basename(executable)) || !path.isAbsolute(passfile)) {
    throw new Error('Absolute psql executable and password-file paths required');
  }
  // Ignore inherited libpq routing/service/password settings. Never alter parent environment.
  const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !/^PG/i.test(key)));
  Object.assign(env, { PGPASSFILE: passfile, PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable',
    PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=5000' });
  const args = ['-X', '-w', '-qAt', '-h', host, '-p', String(Number(port)), '-U', 'postgres',
    '-d', 'doorgo_password_test', '-v', 'ON_ERROR_STOP=1'];
  const guard = `DO $$ BEGIN IF current_database()<>'doorgo_password_test'
    OR inet_server_addr() IS NULL OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
    OR inet_server_port()<>${Number(port)} OR inet_server_port()=5432
    OR current_setting('cluster_name')<>'doorgo_password_isolated'
    OR session_user<>'postgres' THEN RAISE EXCEPTION 'Isolated password test cluster required'; END IF; END $$;`;
  return { executable, args, env, guard };
}
