package appconfig

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
)

var (
	// MagicBytes defines the 6-byte header of HubSight Configuration container (v1).
	MagicBytes = []byte("HSCFG\x01")

	// Argon2id parameters (Memory: 64MB, Time: 4 iterations, Threads: 2, KeyLen: 32 bytes).
	argonTime    uint32 = 4
	argonMemory  uint32 = 64 * 1024
	argonThreads uint8  = 2
	argonKeyLen  uint32 = 32

	ErrInvalidMagic   = errors.New("tệp không phải định dạng .hscfg hợp lệ")
	ErrFileTooShort   = errors.New("dữ liệu tệp cấu hình quá ngắn")
	ErrDecryptionFail = errors.New("giải mã thất bại: mã PIN không chính xác hoặc dữ liệu đã bị sửa đổi")
)

// DeriveKey derives a 256-bit symmetric key from a 6-digit PIN and salt using Argon2id.
func DeriveKey(pin string, salt []byte) []byte {
	return argon2.IDKey([]byte(pin), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
}

// EncryptContainer encrypts plaintext data (ZIP archive) into a secure .hscfg container.
func EncryptContainer(plaintext []byte, pin string) ([]byte, error) {
	if len(pin) < 6 {
		return nil, errors.New("mã PIN phải có ít nhất 6 ký tự")
	}

	// 1. Generate 32-byte cryptographic salt
	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("không thể tạo salt ngẫu nhiên: %w", err)
	}

	// 2. Generate 12-byte GCM Nonce
	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("không thể tạo nonce ngẫu nhiên: %w", err)
	}

	// 3. Derive 32-byte key via Argon2id
	key := DeriveKey(pin, salt)

	// 4. AES-256-GCM cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("lỗi khởi tạo AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("lỗi khởi tạo GCM: %w", err)
	}

	// 5. Encrypt with MagicBytes as Additional Authenticated Data (AAD)
	ciphertext := gcm.Seal(nil, nonce, plaintext, MagicBytes)

	// 6. Assemble container: [Magic: 6B] + [Salt: 32B] + [Nonce: 12B] + [Ciphertext + Tag]
	out := make([]byte, 0, len(MagicBytes)+len(salt)+len(nonce)+len(ciphertext))
	out = append(out, MagicBytes...)
	out = append(out, salt...)
	out = append(out, nonce...)
	out = append(out, ciphertext...)

	return out, nil
}

// DecryptContainer decrypts a .hscfg container and returns the decrypted payload (ZIP archive).
func DecryptContainer(data []byte, pin string) ([]byte, error) {
	minLen := len(MagicBytes) + 32 + 12 + 16
	if len(data) < minLen {
		return nil, ErrFileTooShort
	}

	// 1. Verify Magic header
	if string(data[:len(MagicBytes)]) != string(MagicBytes) {
		return nil, ErrInvalidMagic
	}

	// 2. Extract components
	offset := len(MagicBytes)
	salt := data[offset : offset+32]
	offset += 32
	nonce := data[offset : offset+12]
	offset += 12
	ciphertext := data[offset:]

	// 3. Derive key via Argon2id
	key := DeriveKey(pin, salt)

	// 4. AES-256-GCM cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("lỗi khởi tạo AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("lỗi khởi tạo GCM: %w", err)
	}

	// 5. Open ciphertext with MagicBytes as AAD
	plaintext, err := gcm.Open(nil, nonce, ciphertext, MagicBytes)
	if err != nil {
		return nil, ErrDecryptionFail
	}

	return plaintext, nil
}

// GenerateSigningKeyPair generates a new Ed25519 keypair for digital signing.
func GenerateSigningKeyPair() (ed25519.PublicKey, ed25519.PrivateKey, error) {
	return ed25519.GenerateKey(rand.Reader)
}

// SignData signs arbitrary data using an Ed25519 private key and returns base64 signature.
func SignData(data []byte, privKey ed25519.PrivateKey) string {
	sig := ed25519.Sign(privKey, data)
	return base64.StdEncoding.EncodeToString(sig)
}

// VerifySignature verifies a base64 Ed25519 signature against data and public key.
func VerifySignature(data []byte, sigBase64 string, pubKey ed25519.PublicKey) bool {
	sig, err := base64.StdEncoding.DecodeString(sigBase64)
	if err != nil {
		return false
	}
	return ed25519.Verify(pubKey, data, sig)
}

// ComputeSHA256 computes lowercase hex string of data's SHA-256 digest.
func ComputeSHA256(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
}
