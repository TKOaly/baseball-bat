#!/bin/bash
set -euo pipefail

GREEN="$(tput setaf 2)"
NORMAL="$(tput sgr0)"

function ec() {
  msg="$1"
  echo "${GREEN}${msg}${NORMAL}"
}

function reset_members_hard() {
  ec ">> Members"
  OPTS="--user=root --password=unsecure --host=members-mysql --port=3306 --default-character-set=utf8mb4 members"
  echo "Reseting"
  docker-compose run members-mysql mysql $OPTS -e 'DROP SCHEMA members; CREATE SCHEMA members;'
  echo "Running migrations"
  docker-compose run -T members-mysql mysql $OPTS < ./services/members-events-service/sql/members-latest.sql
  echo "Seeding"
  docker-compose run -T members-mysql mysql $OPTS < ./services/members-events-service/sql/seed.sql
}

function members_truncate() {
  echo "Truncating tables..."
  OPTS="--user=root --password=unsecure --host=members-mysql --port=3306 --default-character-set=utf8mb4 members"
  docker-compose exec members-mysql mysql $OPTS -e "SET FOREIGN_KEY_CHECKS = 0; $(echo $@ | sed -e 's/\w\+/TRUNCATE TABLE \0; /g')" 
}

function reset_members_soft() {
  ec ">> Members"

  members_truncate \
    "calendar_events" \
    "custom_fields" \
    "custom_field_answers" \
    "event_types" \
    "groups" \
    "groups_users" \
    "locations" \
    "payments" \
    "pricings" \
    "registrations" \
    "registration_logs" \
    "users" \
    "privacy_policies" \
    "services" \
    "privacy_policy_consent_data" \
    "sessions"

  echo "Seeding..."
  docker-compose exec -T members-mysql mysql $OPTS < ./services/members-events-service/sql/seed.sql
}

function reset_members() {
  if [[ "$1" = "hard" ]]
  then
    reset_members_hard
  else
    reset_members_soft
  fi
}

function reset_baseball_bat_hard() {
  OPTS="--user=postgres --host=baseball-bat-postgres baseball-bat"
  ec ">> Baseball Bat"
  echo "Clearing database"
  docker-compose run -e PGPASSWORD=password baseball-bat-postgres psql $OPTS -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' > /dev/null 2>/dev/null
  echo "Running migrations"
  docker-compose run --entrypoint npx baseball-bat node-pg-migrate -d POSTGRES_CONNECTION_STRING up > /dev/null 2>/dev/null
}

function baseball_bat_truncate() {
  echo "Truncating tables..."
  OPTS="--user=postgres --host=baseball-bat-postgres baseball-bat"
  docker-compose exec -e PGPASSWORD=password baseball-bat-postgres psql $OPTS -c "$(echo $@ | sed -e 's/\w\+/TRUNCATE TABLE \0 RESTART IDENTITY CASCADE; /g')"
}

function reset_baseball_bat_soft() {
  ec ">> Baseball Bat"
  baseball_bat_truncate \
    "bank_accounts" \
    "bank_statement_transaction_mapping" \
    "bank_statements" \
    "bank_transactions" \
    "debt" \
    "debt_center" \
    "debt_component" \
    "debt_component_mapping" \
    "debt_line" \
    "emails" \
    "line_items" \
    "payer_emails" \
    "payer_profiles" \
    "payment_debt_mappings" \
    "payment_event" \
    "payment_event_debts" \
    "payment_event_log" \
    "payment_event_transaction_mapping" \
    "payment_events" \
    "payment_methods" \
    "payment_numbers" \
    "payments" \
    "pgmigrations" \
    "translations"
}

function reset_baseball_bat() {
  if [[ "$1" = "hard" ]]
  then
    reset_baseball_bat_hard
  else
    reset_baseball_bat_soft
  fi
}

function run() {
  reset_members "$1"
  reset_baseball_bat "$1"
}

run "$1"
