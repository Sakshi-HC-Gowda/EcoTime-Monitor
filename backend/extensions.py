"""Flask extension instances shared by the application and models."""

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Kept outside app.py to avoid importing the application module from models.
db = SQLAlchemy()
migrate = Migrate()
