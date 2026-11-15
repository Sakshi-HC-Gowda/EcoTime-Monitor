"""Encrypted storage for organization-scoped provider credentials."""

from __future__ import annotations

import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models.organization_provider_credential import OrganizationProviderCredential

logger = logging.getLogger(__name__)

ELECTRICITY_MAPS_PROVIDER = "electricity_maps"
ENCRYPTION_KEY_ENV = "ECOTIME_CREDENTIAL_ENCRYPTION_KEY"


class CredentialConfigurationError(RuntimeError):
    """Raised when encrypted credential storage is not configured safely."""


def _fernet() -> Fernet:
    key = os.getenv(ENCRYPTION_KEY_ENV, "").strip()
    if not key:
        raise CredentialConfigurationError(
            f"{ENCRYPTION_KEY_ENV} must be configured to save provider credentials"
        )
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise CredentialConfigurationError(
            f"{ENCRYPTION_KEY_ENV} is not a valid Fernet key"
        ) from exc


def _valid_token(token: str | None) -> str | None:
    if not isinstance(token, str):
        return None
    value = token.strip()
    if not value or value in {"your_api_key_here", "replace-with-your-api-key"}:
        return None
    return value


def get_environment_token() -> str | None:
    return _valid_token(os.getenv("ELECTRICITY_MAPS_API_KEY"))


def get_organization_token(organization_id: int | None) -> str | None:
    if organization_id is None:
        return None
    try:
        credential = OrganizationProviderCredential.query.filter_by(
            organization_id=int(organization_id),
            provider=ELECTRICITY_MAPS_PROVIDER,
        ).first()
        if credential is None:
            return None
        try:
            token = _fernet().decrypt(credential.encrypted_token.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError, ValueError) as exc:
            logger.error(
                "Stored Electricity Maps credential for organization %s could not be decrypted",
                organization_id,
            )
            raise CredentialConfigurationError(
                "Stored Electricity Maps credential is unavailable"
            ) from exc
        return _valid_token(token)
    except CredentialConfigurationError:
        raise
    except SQLAlchemyError as exc:
        db.session.rollback()
        logger.warning(
            "Stored provider credentials are unavailable for organization %s",
            organization_id,
            exc_info=exc,
        )
        return None


def get_electricity_maps_token(organization_id: int | None = None) -> tuple[str | None, str]:
    """Return the organization token, then the environment fallback, without exposing it."""
    try:
        stored = get_organization_token(organization_id)
    except CredentialConfigurationError as exc:
        logger.error(
            "Stored Electricity Maps credential is unavailable; using environment fallback: %s",
            exc,
        )
        stored = None
    if stored:
        return stored, "organization"
    environment = get_environment_token()
    if environment:
        return environment, "environment"
    return None, "none"


def save_organization_token(organization_id: int, token: str | None) -> bool:
    """Create, replace, or clear an encrypted organization token."""
    normalized = _valid_token(token)
    credential = OrganizationProviderCredential.query.filter_by(
        organization_id=int(organization_id),
        provider=ELECTRICITY_MAPS_PROVIDER,
    ).first()

    if normalized is None:
        if credential is not None:
            db.session.delete(credential)
        db.session.commit()
        return False

    encrypted = _fernet().encrypt(normalized.encode("utf-8")).decode("ascii")
    if credential is None:
        credential = OrganizationProviderCredential(
            organization_id=int(organization_id),
            provider=ELECTRICITY_MAPS_PROVIDER,
            encrypted_token=encrypted,
        )
        db.session.add(credential)
    else:
        credential.encrypted_token = encrypted
    db.session.commit()
    return True
