/**
 * Keychain Manager — secure JWT token storage via iOS Keychain.
 */

import Foundation
import Security

final class KeychainManager {
    private static let serviceName = "com.missioncontrol.auth"

    @discardableResult
    static func saveTokens(accessToken: String, refreshToken: String) -> Bool {
        guard let data = try? JSONSerialization.data(
            withJSONObject: ["accessToken": accessToken, "refreshToken": refreshToken]
        ) else { return false }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecValueData as String: data,
        ]

        // Delete existing before saving
        SecItemDelete(query as CFDictionary)

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    static func loadTokens() -> (accessToken: String, refreshToken: String)? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecReturnData as String: true,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let accessToken = dict["accessToken"],
              let refreshToken = dict["refreshToken"]
        else { return nil }

        return (accessToken, refreshToken)
    }

    @discardableResult
    static func deleteTokens() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}
