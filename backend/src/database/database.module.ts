import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONFIG, type DatabaseConfig, resolveDatabaseConfig } from './database.config.js';
import { DatabaseService } from './database.service.js';

const resolved = new WeakMap<ConfigService, DatabaseConfig>();

function databaseConfig(config: ConfigService): DatabaseConfig {
  let value = resolved.get(config);
  if (!value) resolved.set(config, (value = resolveDatabaseConfig((key) => config.get<string>(key))));
  return value;
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      // DatabaseService connects in the background, so startup never waits for (or crashes on) the database.
      useFactory: (config: ConfigService) => ({ ...databaseConfig(config).options, manualInitialization: true }),
    }),
  ],
  providers: [{ provide: DATABASE_CONFIG, inject: [ConfigService], useFactory: databaseConfig }, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
