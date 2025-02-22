export interface User {
    id?: number;
    username: string;
    email: string;
}

export interface UserCredentials {
    username: string;
    password: string;
}

export interface RegisterCredentials extends UserCredentials {
    email: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
} 