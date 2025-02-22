from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ShareRequest(BaseModel):
    email: str

class UserBase(BaseModel):
    email: str
    username: str

class UserResponse(UserBase):
    id: int
    created_at: datetime
    shared_at: Optional[datetime] = None

    class Config:
        orm_mode = True

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    shared_users: Optional[List[UserResponse]] = None

    class Config:
        orm_mode = True

class TextBase(BaseModel):
    title: str
    content: str

class TextCreate(TextBase):
    project_ids: List[int] = []

class TextResponse(TextBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    shared_users: Optional[List[UserResponse]] = None

    class Config:
        orm_mode = True

# ... other existing schemas ... 