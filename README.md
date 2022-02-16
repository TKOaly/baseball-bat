# BBAT - TKO-älys event payment platform

User API autentication combined with data of registered events and stripes payment API = hopefully profit

## devenv

1. Set up user-service locally. This is a hassle but if you manage to do it, also migrate and seed the database. Also create a new service with a redirect url to http://localhost:5000
2. Copy the .env.example to .env and fill in everything.
3. `yarn start:dev`
