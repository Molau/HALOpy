#!/usr/bin/env python3
"""
Helper script to generate bcrypt password hashes for AWS Parameter Store.

Usage:
    python scripts/generate_password_hash.py <password>
    
Example:
    python scripts/generate_password_hash.py mySecretPassword123
    
Then store the generated hash in AWS Parameter Store:
    aws ssm put-parameter --name "/halopy/44-key" --value "<hash>" --type SecureString
    aws ssm put-parameter --name "/halopy/admin-key" --value "<hash>" --type SecureString
"""

import sys
import bcrypt


def generate_hash(password: str) -> str:
    """Generate bcrypt hash from password."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python generate_password_hash.py <password>")
        print()
        print("Example:")
        print("  python scripts/generate_password_hash.py mySecretPassword123")
        print()
        print("Then store in AWS Parameter Store:")
        print('  aws ssm put-parameter --name "/halopy/44-key" --value "<hash>" --type SecureString')
        sys.exit(1)
    
    password = sys.argv[1]
    hash_value = generate_hash(password)
    
    print("=" * 80)
    print("Password Hash Generated")
    print("=" * 80)
    print()
    print("Hash:", hash_value)
    print()
    print("Store this hash in AWS SSM Parameter Store:")
    print()
    print(f'aws ssm put-parameter \\')
    print(f'  --name "/halopy/passwords/kkxx" \\')
    print(f'  --value "{hash_value}" \\')
    print(f'  --type SecureString \\')
    print(f'  --region eu-central-1')
    print()
    print("Replace 'xx' with the observer number (e.g., 44) or 'admin'")
    print("=" * 80)
