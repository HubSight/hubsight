package onvif

import (
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"time"
)

const (
	wsseUsernameTokenDigest = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest"
	wsseNonceBase64Binary   = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary"
)

// GenerateSecurityHeader builds a standard WS-Security UsernameToken header with PasswordDigest.
// clockOffset is added to time.Now() to compensate for any time drift between server and camera.
func GenerateSecurityHeader(username, password string, clockOffset time.Duration) string {
	if username == "" && password == "" {
		return "<s:Header/>"
	}

	// 1. Generate 16 bytes random raw nonce
	rawNonce := make([]byte, 16)
	if _, err := rand.Read(rawNonce); err != nil {
		// Fallback timestamp pseudo-random if rand fails
		for i := range rawNonce {
			rawNonce[i] = byte(time.Now().UnixNano() >> (i * 8))
		}
	}

	// 2. Format created timestamp (UTC)
	createdTime := time.Now().UTC().Add(clockOffset)
	createdStr := createdTime.Format("2006-01-02T15:04:05.000Z")

	// 3. PasswordDigest = Base64(SHA-1(rawNonce + createdStr + password))
	h := sha1.New()
	h.Write(rawNonce)
	h.Write([]byte(createdStr))
	h.Write([]byte(password))
	digest := base64.StdEncoding.EncodeToString(h.Sum(nil))
	nonceB64 := base64.StdEncoding.EncodeToString(rawNonce)

	return fmt.Sprintf(`<s:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                 xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>%s</wsse:Username>
      <wsse:Password Type="%s">%s</wsse:Password>
      <wsse:Nonce EncodingType="%s">%s</wsse:Nonce>
      <wsu:Created>%s</wsu:Created>
    </wsse:UsernameToken>
  </wsse:Security>
</s:Header>`, username, wsseUsernameTokenDigest, digest, wsseNonceBase64Binary, nonceB64, createdStr)
}
