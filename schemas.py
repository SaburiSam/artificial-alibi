from pydantic import BaseModel, Field

class SuspectResponse(BaseModel):
    dialogue: str = Field(description="What the suspect says out loud to the detective.")
    trust_delta: int = Field(description="How much trust changes (Range -20 to +20).")
    suspicion_delta: int = Field(description="How much suspicion changes (Range -20 to +20).")
    statement_key: str = Field(description="Short snake_case tag of their claim, or 'none'.")
    confession_given: bool = Field(description="Set to TRUE only if the detective has presented all evidence and cornered you, forcing a full confession.")
