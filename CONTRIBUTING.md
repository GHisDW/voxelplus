# Contributing to Voxel⁺

Thank you for your interest in contributing to Voxel⁺! This document provides guidelines and instructions for contributing to the project.

## 🤝 How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, please include:

- **Clear description** of the problem
- **Steps to reproduce** the issue
- **Expected behavior** vs. **actual behavior**
- **Screenshots** if applicable
- **Your system information** (Windows version, installed Java versions, etc.)
- **Voxel⁺ version** (from About dialog)

### Suggesting Enhancements

We welcome feature suggestions! Please:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the proposed enhancement
- **Explain why** this enhancement would be useful
- **Consider** if this applies to most users or is a personal preference

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** following our coding standards
4. **Commit your changes** (`git commit -m 'Add amazing feature'`)
5. **Push to the branch** (`git push origin feature/amazing-feature`)
6. **Open a Pull Request**

## 🛠️ Development Setup

### Prerequisites

- **Node.js 18+**
- **Git**
- **Windows 10/11** (primary development platform)
- **Multiple Java versions** (8, 17, 21) for testing

### Setting Up

1. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/voxelplus.git
   cd voxelplus
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run app:dev
   ```

## 📝 Coding Standards

### TypeScript

- **Use TypeScript strict mode**
- **Follow existing naming conventions**
- **Add type annotations** for all function parameters and return types
- **Prefer interfaces over types** for object shapes
- **Use const/let** instead of var

### Code Style

- **Use 2 spaces** for indentation
- **Use single quotes** for strings
- **Add semicolons** at the end of statements
- **Keep functions small** and focused
- **Add meaningful comments** for complex logic

### File Organization

- **Keep related files together**
- **Use descriptive filenames**
- **Follow the existing directory structure**
- **Separate concerns** (UI, logic, data)

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, please test:

- [ ] **Instance creation** for different Minecraft versions
- [ ] **Java detection** works correctly
- [ ] **Mod installation** from Modrinth
- [ ] **Instance launch** and proper shutdown
- [ ] **Error handling** for edge cases
- [ ] **UI responsiveness** and layout

### Compatibility Testing

Test with:
- **Java 8, 17, and 21** installed
- **Different Minecraft versions** (1.15.2, 1.16.5, 1.20.1, 1.21.1)
- **Various mod combinations**

## 📚 Documentation

### Code Documentation

- **Add JSDoc comments** for public functions
- **Document complex algorithms**
- **Explain non-obvious logic**
- **Keep documentation up to date** with code changes

### User Documentation

- **Update README.md** for new features
- **Add screenshots** for UI changes
- **Document configuration options**
- **Provide examples** where helpful

## 🐛 Bug Fix Guidelines

When fixing bugs:

1. **Add a test case** if applicable
2. **Fix the issue** with minimal changes
3. **Verify the fix** doesn't break existing functionality
4. **Update documentation** if needed
5. **Reference the issue** in commit messages

## ✨ Feature Guidelines

When adding features:

1. **Check existing issues** for similar requests
2. **Discuss large changes** in an issue first
3. **Follow existing patterns** in the codebase
4. **Update the README** with new features
5. **Consider backward compatibility**

## 🎨 UI/UX Guidelines

- **Keep the interface clean** and intuitive
- **Follow the existing design language**
- **Ensure good contrast** and readability
- **Provide feedback** for user actions
- **Handle errors gracefully** with helpful messages

## 🔒 Security Considerations

- **Never expose sensitive data** in logs
- **Validate all user inputs**
- **Use environment variables** for secrets
- **Follow Electron security best practices**
- **Keep dependencies updated**

## 📤 Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(instances): add support for Minecraft 1.21.2
fix(java): resolve Java detection on Windows 11
docs(readme): update installation instructions
```

## 🤝 Community Guidelines

- **Be respectful** and constructive
- **Welcome newcomers** and help them learn
- **Focus on what is best** for the community
- **Show empathy** towards other community members
- **Gracefully accept constructive criticism**

## 📧 Getting Help

If you need help contributing:

- **Open an issue** with your question
- **Join discussions** in existing issues
- **Email**: mokshadshetty@gmail.com
- **GitHub**: [@GHisDW](https://github.com/GHisDW)

## 🎉 Recognition

Contributors will be:
- **Listed in the README**
- **Acknowledged in release notes**
- **Invited to become maintainers** for significant contributions

---

Thank you for contributing to Voxel⁺! Every contribution helps make the project better for everyone.

<div align="center">

**Happy Coding! 🚀**

</div>
