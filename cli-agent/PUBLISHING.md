# Publishing to PyPI

This package is prepared for PyPI publication as `syseye-agent`.

Before the first public release:
- verify that the name `syseye-agent` is still available on PyPI
- create a PyPI project
- configure Trusted Publishing for your GitHub repository

## Local build

Use a clean virtualenv:

```bash
cd cli-agent
python -m venv .venv
source .venv/bin/activate
pip install setuptools wheel build twine requests
pip install --no-build-isolation -e .[dev]
python -m build
python -m twine check dist/*
```

## Manual upload

```bash
python -m twine upload dist/*
```

## Trusted Publishing

This repo includes a GitHub Actions workflow:

```text
.github/workflows/publish-pypi.yml
```

Once Trusted Publishing is configured in PyPI, creating a GitHub release can publish the package automatically.

## Install after publish

```bash
pipx install syseye-agent
```
