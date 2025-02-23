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
        from_attributes = True

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
    owner: Optional[UserResponse] = None
    is_shared: bool = False

    class Config:
        from_attributes = True

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
    owner: Optional[UserResponse] = None
    is_shared: bool = False

    class Config:
        from_attributes = True

class FolderBase(BaseModel):
    name: str
    project_id: int
    parent_folder_id: Optional[int] = None

class FolderCreate(FolderBase):
    pass

class FolderResponse(FolderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    documents: Optional[List[dict]] = None
    texts: Optional[List[dict]] = None
    child_folders: Optional[List['FolderResponse']] = None

    class Config:
        from_attributes = True

# ... other existing schemas ... 